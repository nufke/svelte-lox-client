import Auth from './Auth';
import { hash, hmacHash } from '../Utils/Hasher';
import WebSocketConnection from '../Services/WebSocketConnection';
import TextMessage from '../WebSocketMessages/TextMessage';
import Logger from '../Utils/Logger';

/** 
 * Class that manages token lifecycle for the Miniserver connection.
 * Acquires, refreshes, checks, and revokes tokens, and schedules automatic
 * refresh before expiry.
 */
class TokenHandler {
	token: string | undefined;
	auth: Auth;
	userName: string;
	deviceId: string;
	connection: WebSocketConnection;
	validUntil: string | undefined;
	validUntilDateUTC: Date | undefined;
	password: string;
	// timer that will attempt to refresh the token before it expires
	private refreshTimer: NodeJS.Timeout | undefined;
	// buffer (ms) before actual expiry when we attempt to refresh
	private refreshBufferMs = 2 * 3600 * 1000; // 2 hours
	// retry/backoff settings when refresh fails
	private refreshRetryMs = 5 * 60 * 1000; // 5 minutes
	private refreshMaxRetries = 5;
	private refreshRetries = 0;
	log: Logger;
	private permission: number; // token lifetime: 2= short, 4=long

	/**
	 * Initialises the token handler with auth service, logger, connection,
	 * and user credentials.
	 * @param auth authentication
	 * @param log logger
	 * @param connection WebSocketConnection
	 * @param userName name of user
	 * @param password password of user
	 * @param deviceId ID of client app  (should be app specific)
	 * @param permission token lifetime: 2: short (for web) or 4: long (for app)
	 */
	constructor(auth: Auth, log: Logger, connection: WebSocketConnection, userName: string, password: string, deviceId: string, permission: number) {
		this.log = log;
		this.auth = auth;
		this.connection = connection;
		this.userName = userName;
		this.password = password;
		this.deviceId = deviceId;
		this.permission = permission;
	}

	/**
	 * Refreshes the current token and schedules the next refresh; 
	 * acquires a new token instead if the current one has already expired.
	 */
	async refreshToken(): Promise<void> {
		if (!this.token || !this.validUntilDateUTC) {
			throw new Error('No token to refresh');
		}

		const msUntilExpiry = this.validUntilDateUTC.getTime() - Date.now();

		if (msUntilExpiry < 0) {
			this.log.warn('Token cannot be refreshed any more as it expired. Trying to acquire a new one');
			this.acquireToken();
			return;
		}

		// 1. Acquire new key, salt & hashAlg at once using /jdev/sys/getkey2/{user}
		await this.auth.getUserKey();

		if (!this.auth.userKey) {
			throw new Error('User key is missing');
		}

		// 2. hash token
		const tokenHash = hmacHash(this.token, this.auth.userKey);

		// 3. Request a JSON Web Token using /jdev/sys/refreshjwt/{tokenHash}/{this.userName}
		const refreshTokenCommand = `jdev/sys/refreshjwt/${tokenHash}/${this.userName}`;
		const refreshTokenResponse = await this.connection.sendEncryptedTextCommand(refreshTokenCommand);

		// 4. Store response
		this.token = refreshTokenResponse.value.token;
		this.processTokenResponse(refreshTokenResponse);
	}

	/**
	 * Acquires a new long-lived token using the hashed user credentials and schedules automatic refresh.
	 */
	async acquireToken(): Promise<void> {
		// 1. Acquire the key, salt & hashAlg at once using /jdev/sys/getkey2/{user}
		await this.auth.getUserKey();
		if (!this.auth.userKey) {
			throw new Error('User key is missing');
		}

		// 2. Hash the password including the user specific salt
		const pwdHashPayload = `${this.password}:${this.auth.userSalt}`;
		const pwdHash = hash(pwdHashPayload, this.auth.userHashAlg).toUpperCase();

		// 3. Create the hmac hash that includes the user name
		const userHashPayload = `${this.userName}:${pwdHash}`;
		const userHash = hmacHash(userHashPayload, this.auth.userKey);

		// 4. Request a JSON Web Token using /jdev/sys/getjwt/{hash}/{user}/{permission}/{uuid}/{info}
		if (!this.deviceId || !this.deviceId.length) {
			throw new Error('Device ID is missing!');
		}

		const permission = this.permission == 2 || this.permission == 4 ? this.permission : 4; 
		const info = `svelte-lox-client-${this.userName}`; // client description
		const jwtUrl = `jdev/sys/getjwt/${userHash}/${this.userName}/${permission}/${this.deviceId}/${info}`;
		const jwtResponse = await this.connection.sendEncryptedTextCommand(jwtUrl);

		// 5. Store the response, it contains info on the lifespan, the permissions granted with that token and the JSON Web Token itself.
		if (jwtResponse.code !== 200) {
			throw new Error(`Failed to acquire token: ${jwtResponse.code}`);
		}
		if (!jwtResponse.value) {
			throw new Error('jwtResponse.value is undefined');
		}

		const duration = permission == 4 ? 'long-lived app' : 'short-lived web';
		this.log.info(`Acquired ${duration} token`);

		this.token = jwtResponse.value.token;
		this.processTokenResponse(jwtResponse);
	}

	/**
	 * Verifies if the given or stored token is still valid.
	 * @param token (optional) token to be checked
	 */
	async checkToken(token?: string): Promise<void> {
		const tokenTocheck = token || this.token;
		if (!tokenTocheck) return;

		await this.auth.getUserKey();
		if (!this.auth.userKey) {
			throw new Error('User key is missing');
		}
		const tokenHash = hmacHash(tokenTocheck, this.auth.userKey);
		const checkTokenCommand = `jdev/sys/checktoken/${tokenHash}/${this.userName}`;
		const checkTokenResponse = await this.connection.sendEncryptedTextCommand(checkTokenCommand);
		if (checkTokenResponse.code !== 200) {
			this.log.info(`Token is not valid: ${checkTokenResponse.code}`);
			return;
		}
		this.log.info(`Token is valid: ${checkTokenResponse.code}`);
	}

	/**
	 * Authenticates the WebSocket session and schedules automatic refresh.
	 * @param token token to be used in authentication
	 */
	async authenticateWithToken(token: string): Promise<void> {
		if (!token) {
			return;
		}
		await this.auth.getUserKey();
		if (!this.auth.userKey) {
			throw new Error('User key is missing');
		}
		const tokenHash = hmacHash(token, this.auth.userKey);

		const authWithTokenCommand = `authwithtoken/${tokenHash}/${this.userName}`;
		const authWithTokenResponse = await this.connection.sendEncryptedTextCommand(authWithTokenCommand);
		if (authWithTokenResponse.code !== 200) {
			throw new Error(`Failed to authenticate with existing token: ${authWithTokenResponse.code}`);
		}
		this.log.info('Authenticated with existing token');

		this.token = token;
		this.processTokenResponse(authWithTokenResponse);
	}

	/**
	 * Revokes the current token on the Miniserver, cancel any scheduled refresh,
	 * and ignores errors (the server will close the connection).
	 */
	async killToken(): Promise<void> {
		if (this.token) {
			await this.auth.getUserKey();
			if (!this.auth.userKey) {
				throw new Error('User key is missing');
			}

			const tokenHash = hmacHash(this.token, this.auth.userKey);
			const killTokenCommand = `jdev/sys/killtoken/${tokenHash}/${this.userName}`;
			try {
				await this.connection.sendEncryptedTextCommand(killTokenCommand);
				// Miniserver will disconnect the websocket
			} catch {
				/* ignore any exceptions */
			}
			this.clearScheduledRefresh();
			this.log.info('Token killed on request');
		}
	}

	/**
	 * Stores the time validity of the token 
	 * and schedule the next automatic refresh.
	 * @param tokenResponse response from Miniserver to confirm token validity
	 */
	private processTokenResponse(tokenResponse: TextMessage): void {
		this.validUntil = tokenResponse.value.validUntil;
		if (!this.validUntil) {
			throw new Error('Token validUntil is missing');
		}
		const seconds = parseInt(this.validUntil);
		const baseMs = Date.UTC(2009, 0, 1, 0, 0, 0);
		this.validUntilDateUTC = new Date(baseMs + seconds * 1000);

		this.log.info(`Token valid until: ${this.validUntilDateUTC.toLocaleString()}`);

		// Schedule automatic refresh
		this.refreshRetries = 0;
		this.scheduleRefresh();
	}

	/**
	 * Cancels any pending token refresh timer.
	 */
	clearScheduledRefresh(): void {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer);
			this.refreshTimer = undefined;
		}
	}

	/**
	 * Schedules the next token refresh before expiry, capped at one week;
	 * Retries with backoff on failure up to specified maximum number of retries.
	 */
	private scheduleRefresh(): void {
		this.clearScheduledRefresh();

		if (!this.token || !this.validUntilDateUTC) throw new Error('No token to schedule refresh for');

		const msUntilExpiry = this.validUntilDateUTC.getTime() - Date.now();
		const msUntilRefresh = msUntilExpiry - this.refreshBufferMs;

		const scheduleMs = msUntilRefresh > 0 ? msUntilRefresh : 0;

		// cap schedule to a reasonable maximum (1 week) to avoid overflow
		const maxMs = 7 * 24 * 60 * 60 * 1000;
		const finalMs = Math.min(scheduleMs, maxMs);

		const refreshDate = new Date(Date.now() + finalMs);

		this.log.info(`Scheduling token refresh at ${refreshDate.toLocaleString()}`);

		this.refreshTimer = setTimeout(async () => {
			try {
				this.log.info('Reached scheduled token refresh time');
				if (msUntilExpiry < 0) {
					this.log.info('Token already expired, acquiring a new one');
					await this.acquireToken();
				} else {
					this.log.info('Attempting refresh of existing token');
					await this.refreshToken();
				}
			} catch (err) {
				// on failure, retry with backoff until max retries
				this.refreshRetries = (this.refreshRetries || 0) + 1;
				this.log.error(`Token refresh failed (attempt ${this.refreshRetries}):`, err);
				if (this.refreshRetries <= this.refreshMaxRetries) {
					this.refreshTimer = setTimeout(() => this.scheduleRefresh(), this.refreshRetryMs * this.refreshRetries);
				} else {
					this.log.error('Max token refresh retries reached, giving up');
				}
			}
		}, finalMs);
	}
}

export default TokenHandler;
