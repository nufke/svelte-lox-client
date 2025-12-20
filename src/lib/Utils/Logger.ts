/**
 * Basic logger class using the console, since this is a client app running in a browser
 *  @param logLevel log level for the Logger (see LogLevel for details)
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
 *  DEBUG: shows debug, info, warn, error
 *  INFO : shows info, warn, error
 *  WARN : shows warn, error
 *  ERROR: shows error
 *  NONE : no logging
 */
export const enum LogLevel {
	DEBUG = 4,
	INFO = 3,
	WARN = 2,
	ERROR = 1,
	NONE = 0
}
