import LoxClient from '../LoxClient';

class AutoReconnect {
	autoReconnectEnabled: boolean;
	autoReconnectingInProgress = false;
	reconnectTimeout: NodeJS.Timeout | undefined;
	// resolve function for the pending sleep so we can cancel it
	client: LoxClient;

	reconnectResolve: undefined | ((value: boolean | PromiseLike<boolean>) => void);

	constructor(client: LoxClient, autoReconnectEnabled: boolean) {
		this.autoReconnectEnabled = autoReconnectEnabled;
		this.client = client;
	}

	async startAutoReconnect(existingToken?: string) {
		if (this.autoReconnectingInProgress) return;
		if (!this.autoReconnectEnabled) return;

		this.autoReconnectingInProgress = true;

		// run a cancelable loop that attempts to reconnect every 30s
		while (this.autoReconnectEnabled && this.autoReconnectingInProgress) {
			console.info('Waiting 30 seconds before reconnecting');

			// allow aborting
			const shouldReturn = await new Promise<boolean>((resolve) => {
				this.reconnectResolve = resolve;
				this.reconnectTimeout = setTimeout(() => {
					this.reconnectTimeout = undefined;
					this.reconnectResolve = undefined;
					resolve(false);
				}, 30000);
			});
			if (shouldReturn) return;

			console.info(`Reconnecting after disconnect...`);
			try {
				await this.client.connect(existingToken);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} catch (err: any) {
				console.error(`Reconnect attempt failed: ${err?.message ?? err}`, err);
			}
		}
	}

	stopAutoReconnect() {
		this.autoReconnectingInProgress = false;

		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = undefined;
		}

		// if a sleep is pending, resolve it so the loop can exit promptly
		if (this.reconnectResolve) {
			console.info('Stopping pending reconnect');
			try {
				this.reconnectResolve(true);
			} catch {
				/* ignore */
			}
			this.reconnectResolve = undefined;
		}
	}

	disableAutoReconnect() {
		this.autoReconnectEnabled = false;
		this.stopAutoReconnect();
	}
}

export default AutoReconnect;
