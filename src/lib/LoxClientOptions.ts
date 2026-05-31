import { LogLevel } from './Utils/Logger';

enum TokenLifetimeType {
	SHORT = 2,
	LONG = 4,
}

/**
 * Class to encapsulate options for configuring the LoxClient
 * @param autoReconnectEnabled Whether to enable automatic reconnection
 * @param keepAliveEnabled Whether to enable keep-alive
 * @param messageLogEnabled Whether to enable message logging
 * @param logLevel The logging level for the LoxClient
 * @param maintainLatestEvents Whether to maintain the latest event for each state
 * @param tokenLifetime Token lifetime for Web (SHORT) or App (LONG)
 */
class LoxClientOptions {
	public autoReconnectEnabled: boolean;
	public keepAliveEnabled: boolean;
	public messageLogEnabled: boolean;
	public maintainLatestEvents: boolean;
	public logLevel: number;
	public tokenLifetime: TokenLifetimeType;

	/**
	 * Creates a LoxClientOptions instance, applying any provided partial overrides over the defaults.
	 * @param options Object of type LoxClientOptions
	 */
	constructor(options: Partial<LoxClientOptions> = {}) {
		this.autoReconnectEnabled = options.autoReconnectEnabled ?? true;
		this.keepAliveEnabled = options.keepAliveEnabled ?? true;
		this.messageLogEnabled = options.messageLogEnabled ?? true;
		this.maintainLatestEvents = options.maintainLatestEvents ?? true;
		this.logLevel = options.logLevel ?? LogLevel.NONE;
		this.tokenLifetime = options.tokenLifetime ?? TokenLifetimeType.LONG;
	}
}

export { LoxClientOptions };
