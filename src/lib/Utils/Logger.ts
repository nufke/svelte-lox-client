/**
 * Basic logger class using the console, since this is a client app running in a browser
 *  @param logLevel log level for the Logger (see LogLevel for details)
 */
class Logger {
	private logLevel: LogLevel;

	/**
	 * Creates a Logger that emits messages at or above the given logLevel.
	 * @param logLevel level for logging
	 */
	constructor(logLevel: LogLevel) {
		this.logLevel = logLevel;
	}

	/**
	 * Changes the active log level at runtime.
	 * @param logLevel level for logging
	 */
	setLogLevel(logLevel: LogLevel): void {
		this.logLevel = logLevel;
	}

	/**
	 * Emits a debug-level message; only visible when log level is DEBUG.
	 * @param message debug message
	 * @param parameters (optional) addition parameters added to the debug message
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	debug(message: string, ...parameters: any): void {
		if (this.logLevel >= LogLevel.DEBUG) {
			console.debug(message, ...parameters);
		}
	}

	/**
	 * Emits an info-level message; visible at INFO and above.
	 * @param message info message
	 * @param parameters (optional) addition parameters added to the info message
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	info(message: string, ...parameters: any): void {
		if (this.logLevel >= LogLevel.INFO) {
			console.info(message, ...parameters);
		}
	}

	/**
	 * Emits a warning-level message; visible at WARN and above.
	 * @param message warning message
	 * @param parameters (optional) addition parameters added to the warning message
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	warn(message: string, ...parameters: any): void {
		if (this.logLevel >= LogLevel.WARN) {
			console.warn(message, ...parameters);
		}
	}

	/**
	 * Emits an error-level message; visible at ERROR and above.
	 * @param message error message
	 * @param parameters (optional) addition parameters added to the error message
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	error(message: string, ...parameters: any): void {
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
