import Logger from '../Utils/Logger';
import LoxClient from '../LoxClient';

/**
 * Class that manages automatic reconnection after a disconnect,
 * retrying every 30 seconds until a connection is re-established
 * or reconnection is disabled.
 */
class AutoReconnect {
	autoReconnectEnabled: boolean;
	autoReconnectingInProgress = false;
	reconnectTimeout: NodeJS.Timeout | undefined;
	// resolve function for the pending sleep so we can cancel it
	client: LoxClient;
	log: Logger;

	reconnectResolve: undefined | ((value: boolean | PromiseLike<boolean>) => void);

	/**
	 * Initialises the auto-reconnect service with the owning client,
	 * logger, and whether reconnection is enabled.
	 */
	constructor(client: LoxClient, log: Logger, autoReconnectEnabled: boolean) {
		this.autoReconnectEnabled = autoReconnectEnabled;
		this.client = client;
		this.log = log;
	}

	/**
	 * Starts the reconnection loop, waiting 30 seconds between attempts; 
	 * passes `existingToken` to each reconnect call. No-ops if already running or disabled.
	 */
	async startAutoReconnect(existingToken?: string): Promise<void> {
		if (this.autoReconnectingInProgress) return;
		if (!this.autoReconnectEnabled) return;

		this.autoReconnectingInProgress = true;

		// run a cancelable loop that attempts to reconnect every 30s
		while (this.autoReconnectEnabled && this.autoReconnectingInProgress) {
			this.log.info('Waiting 30 seconds before reconnecting');

			// allow aborting
			const shouldReturn = await new Promise<boolean>((resolve) => {
				this.reconnectResolve = resolve;
				this.reconnectTimeout = setTimeout(() => {
					this.reconnectTimeout = undefined;
					this.reconnectResolve = undefined;
					resolve(false);
				}, 30000);
			});
			if (shouldReturn) {
				return;
			}

			this.log.info('Reconnecting after disconnect...');
			try {
				await this.client.connect(existingToken);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} catch (err: any) {
				this.log.error(`Reconnect attempt failed: ${err?.message ?? err}`, err);
			}
		}
	}

	/**
	 * Cancels the active reconnect loop and any pending sleep timer,
	 * allowing a clean exit from startAutoReconnect.
	 */
	stopAutoReconnect(): void {
		this.autoReconnectingInProgress = false;

		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = undefined;
		}

		// if a sleep is pending, resolve it so the loop can exit promptly
		if (this.reconnectResolve) {
			this.log.info('Stopping pending reconnect');
			try {
				this.reconnectResolve(true);
			} catch {
				/* ignore */
			}
			this.reconnectResolve = undefined;
		}
	}

	/**
	 * Permanently disables auto-reconnection and stops any in-progress reconnect loop.
	 */
	disableAutoReconnect(): void {
		this.autoReconnectEnabled = false;
		this.stopAutoReconnect();
	}
}

export default AutoReconnect;
