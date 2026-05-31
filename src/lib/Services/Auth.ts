import TokenHandler from './TokenHandler';
import WebSocketConnection from '../Services/WebSocketConnection';
import { constants, publicEncrypt } from 'crypto';
import CommandEncryption from './CommandEncryption';
import Logger from '../Utils/Logger';

/** 
 * Class handling the authentication handshake with the Miniserver, including
 * RSA public-key exchange, AES session-key setup, and token acquisition/refresh.
 */
class Auth {
	private hostName: string;
	private userName: string;
	private connection: WebSocketConnection;
	private publicKey: { key: string; padding: number } | undefined;
	private sessionKey: string | undefined;
	tokenHandler: TokenHandler;
	userKey: Buffer<ArrayBuffer> | undefined;
	userHashAlg: string | undefined;
	userSalt: string | undefined;
	commandEncryption: CommandEncryption;
	log: Logger;

	/**
	 * Initialises the authentication service with all connection parameters and
	 * creates the token handler and command encryption instances.
	 * @param log logger
	 * @param connection WebSocketConnection
	 * @param userName name of user
	 * @param password password of user
	 * @param deviceId ID of client app  (should be app specific)
	 * @param permission token lifetime: 2: short (for web) or 4: long (for app)
	 * 
	 */
	constructor(log: Logger, connection: WebSocketConnection, hostName: string, userName: string, password: string, deviceId: string, permission: number) {
		this.log = log;
		this.connection = connection;
		this.hostName = hostName;
		this.userName = userName;
		this.tokenHandler = new TokenHandler(this, this.log, this.connection, this.userName, password, deviceId, permission);
		this.commandEncryption = new CommandEncryption(this);
	}

	/**
	 * Method that runs the authentication handshake: fetches the server certificate,
	 * exchanges the AES session key, then authenticates with an existing token or
	 * acquires a new one.
	 * @param existingToken (optional) existing token from previous session
	 */
	async authenticate(existingToken?: string): Promise<void> {
		// 1. get public key
		await this.getPublicKey();
		if (!this.publicKey) throw new Error('Public key is missing!');

		// 2. verify public key
		// TODO

		// 3. generate AES key - done in CommandEncryption constructor

		// 4. generate IV - done in CommandEncryption constructor

		// 5. encrypt key+iv with public key
		const payload = `${this.commandEncryption.key.toString('hex')}:${this.commandEncryption.iv.toString('hex')}`;
		const encrypted = publicEncrypt(this.publicKey, Buffer.from(payload));
		this.sessionKey = encrypted.toString('base64');

		// 6. exchange session key
		const keyExchangeCommand = `jdev/sys/keyexchange/${this.sessionKey}`;
		const response = await this.connection.sendUnencryptedTextCommand(keyExchangeCommand);
		if (response.code !== 200) {
			throw new Error(`Failed to exchange session key: ${response.code}`);
		}

		// 7. generate random salt - done in constructor

		// 8. auth with existing token or acquire token
		if (existingToken) {
			await this.tokenHandler.authenticateWithToken(existingToken);
		} else {
			await this.tokenHandler.acquireToken();
		}

		this.log.info('Authentication complete');
	}

	/** 
	 * Fetches the server's TLS certificate chain
	 * and stores the leaf certificate as the public key.
	 */
	private async getPublicKey(): Promise<void> {
		const url = `${this.hostName}/jdev/sys/getcertificate`;
		const response = await fetch(url);
		this.parsePublicKey(await response.text());
	}

	/**
	 * Parses a PEM certificate chain string and stores the last
	 * certificate block as the RSA public key with PKCS#1 padding.
	 * @param certificate PEM certificate in plain text
	 */
	private parsePublicKey(certificate: string): void {
		const certBlocks = certificate.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
		if (certBlocks === null || certBlocks?.length === 0) {
			throw new Error('No public key found in getPublicKey response');
		}
		const leafCert = certBlocks[certBlocks.length - 1];
		this.publicKey = {
			'key': leafCert,
			'padding': constants.RSA_PKCS1_PADDING,
		};
	}

	/**
	 * Fetches the user's HMAC key, salt, and hash algorithm
	 * and stores them in this instance.
	 */
	async getUserKey(): Promise<void> {
		const getKeyCommand = `jdev/sys/getkey2/${this.userName}`;
		const getKeyResponse = await this.connection.sendEncryptedTextCommand(getKeyCommand);
		if (getKeyResponse.code !== 200) {
			throw new Error(`Failed to getkey2: ${getKeyResponse.code}`);
		}
		if (!getKeyResponse.value) {
			throw new Error('getkeyresponse.value is undefined');
		}

		// server returns the key as a hex-encoded string; convert to raw bytes
		const serverKeyHex = getKeyResponse.value.key;
		this.userKey = Buffer.from(serverKeyHex, 'hex');
		this.userSalt = getKeyResponse.value.salt;
		this.userHashAlg = getKeyResponse.value.hashAlg;
	}

	/**
	 * Fetches the visualization password salt, key, and hash algorithm 
	 * from a given user, for secured command hashing.
	 * @returns Object containing key, salt, and hash algorithm
	 */
	async getVisuSalt(): Promise<{ key: string; salt: string; hashAlg: string }> {
		const command = `jdev/sys/getvisusalt/${this.userName}`;
		const response = await this.connection.sendEncryptedTextCommand(command);
		if (response.code !== 200) {
			throw new Error(`Failed to getvisusalt: ${response.code}`);
		}
		if (!response.value) {
			throw new Error('getvisusalt.value is undefined');
		}
		const key = response.value.key;
		const salt = response.value.salt;
		const hashAlg = response.value.hashAlg;
		return {key, salt, hashAlg};
	}
}

export default Auth;
