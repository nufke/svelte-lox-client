/**
 * Basic logger class using the console, since this is a client app running in a browser
 */
class Logger {
	private logLevel: LogLevel;

	constructor(logLevel: LogLevel) {
		this.logLevel = logLevel;
	}

	setLogLevel(logLevel: LogLevel) {
		this.logLevel = logLevel;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	debug(message: string, ...parameters: any) {
		if (this.logLevel >= LogLevel.DEBUG) {
			console.debug(message, ...parameters);
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	info(message: string, ...parameters: any) {
		if (this.logLevel >= LogLevel.INFO) {
			console.info(message, ...parameters);
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	warn(message: string, ...parameters: any) {
		if (this.logLevel >= LogLevel.WARN) {
			console.warn(message, ...parameters);
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	error(message: string, ...parameters: any) {
		if (this.logLevel >= LogLevel.ERROR) {
			console.error(message, ...parameters);
		}
	}
}

export default Logger;

/**
 * LogLevel enumeration to specify the logging level
 */
export const enum LogLevel {
	NONE = 0,
	DEBUG = 1,
	INFO = 2,
	WARN = 3,
	ERROR = 4
}
