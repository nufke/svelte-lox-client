/**
 * Options for configuring the LoxClient
 * @param autoReconnectEnabled Whether to enable automatic reconnection
 * @param keepAliveEnabled Whether to enable keep-alive
 * @param messageLogEnabled Whether to enable message logging
 * @param logAllEvents Whether to log all events even when using a UUID watch list
 * @param logLevel The logging level for the LoxClient
 * @param maintainLatestEvents Whether to maintain the latest event for each state
 */
class LoxClientOptions {
	public autoReconnectEnabled: boolean;
	public keepAliveEnabled: boolean;
	public messageLogEnabled: boolean;
	public maintainLatestEvents: boolean;

	constructor(options: Partial<LoxClientOptions> = {}) {
		this.autoReconnectEnabled = options.autoReconnectEnabled ?? true;
		this.keepAliveEnabled = options.keepAliveEnabled ?? true;
		this.messageLogEnabled = options.messageLogEnabled ?? true;
		this.maintainLatestEvents = options.maintainLatestEvents ?? true;
	}
}

export { LoxClientOptions };
