import FileMessage from '../WebSocketMessages/FileMessage';
import TextMessage from '../WebSocketMessages/TextMessage';
import MessageType from '../WebSocketMessages/MessageType';
import { LoxEvent, type LoxEventCtor } from '../LoxEvents/LoxEvent';
import LoxWeatherEvent from '../LoxEvents/LoxWeatherEvent';
import LoxDayTimerEvent from '../LoxEvents/LoxDayTimerEvent';
import LoxTextEvent from '../LoxEvents/LoxTextEvent';
import LoxValueEvent from '../LoxEvents/LoxValueEvent';
import ParsedHeader from '../WebSocketMessages/ParsedHeader';
import LoxClient from '../LoxClient';
import Logger from '../Utils/Logger';
import { maskEnc } from '../Utils/Masker';
import { hash, hmacHash } from '../Utils/Hasher';
import { type WebSocketConnectionEvents } from './WebSocketConnectionEvents';

/**
 * Interface definition of pending queue entry for text/file command promises.
 */
interface PendingQueueEntry<T extends FileMessage | TextMessage> {
	command: {
		originalCommand: string;
		encryptedCommand: string | undefined;
	};
	encrypted: boolean;
	resolve: (msg: T) => void;
	reject: (err: unknown) => void;
	timer: NodeJS.Timeout;
}

/**
 * Class that manages the WebSocket connection to the Miniserver.
 * It handles the binary message-type state machine, queues outgoing commands
 * with timeout-based promise resolution, and emits typed events for clients.
 */
class WebSocketConnection extends EventTarget {
	private nextExpectedMessageType: MessageType = MessageType.HEADER;
	private ws: WebSocket | undefined;
	private hostName: string;
	private LoxClient: LoxClient;

	// keepalive handling
	private keepAliveInterval: NodeJS.Timeout | undefined;
	private keepAliveEnabled = false;

	// queue of outstanding commands waiting for a text response
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private commandQueue: PendingQueueEntry<any>[] = [];

	private COMMAND_TIMEOUT: number;
	private KEEPALIVE_INTERVAL_MS = 15000;
	private KEEPALIVE_COMMAND_TIMEOUT_MS = 5000;
	private lastFilenameRequested = '';
	private log: Logger;
	private messageLog: boolean;

	/**
	 * Initializes the WebSocket connection manager.
	 * Note: it does not open the WebSocket until the connect method is called.
	 * @param LoxClient client instance
	 * @param log logger instance
	 * @param hostName name of host
	 * @param commandTimeout timeout for commands
	 * @param messageLog enable logging of info messages
	 */
	constructor(LoxClient: LoxClient, log: Logger, hostName: string, commandTimeout: number, messageLog: boolean) {
		super();
		this.LoxClient = LoxClient;
		this.hostName = hostName;
		this.COMMAND_TIMEOUT = commandTimeout;
		this.log = log;
		this.messageLog = messageLog;
	}

	/**
	 * Opens a WebSocket connection to the Miniserver, using secure WebSocket (wss) connection
	 * when the host scheme is `https`, otherwise use a non-secure WebSocket (ws) connection.
	 */
	async connect(): Promise<void> {
		const found = this.hostName.match(/(.*\/\/)?(.*)/);
		const protocol = found && found[1].includes('https') ? 'wss' : 'ws';
		const url = found && found[2] ? `${protocol}://${found[2]}/ws/rfc6455` : null;

		if (url) {
			this.ws = new WebSocket(url, 'remotecontrol');
			this.ws.binaryType = 'arraybuffer'; /* for binary data get ArrayBuffer instead of Blob */
		} else {
			this.log.error('Invalid Miniserver hostname');
		}

		this.ws?.addEventListener('open', () => {
			this.emit('connected');
		});

		this.ws?.addEventListener('close', this.cleanupAfterDisconnectOrError);
		this.ws?.addEventListener('error', this.cleanupAfterDisconnectOrError);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.ws?.addEventListener('message', (message: any) => {
			this.handleMessage(message);
		});

		return new Promise<void>((resolve, reject) => {
			this.ws?.addEventListener('open', () => resolve());
			this.ws?.addEventListener('error', reject);
		});
	}

	/**
	 * Starts sending a keepalive command every 15 seconds; closes the connection
	 * if a keepalive times out. No-ops if already active.
	 */
	enableKeepAlive(): void {
		if (this.keepAliveEnabled) {
			return;
		}
		this.keepAliveEnabled = true;

		// send keepalive periodically; rely on sendUnencryptedTextCommand to reject on timeout
		this.keepAliveInterval = setInterval(async () => {
			if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
				return;
			}

			try {
				// send unencrypted keepalive and wait for response or timeout
				await this.sendUnencryptedTextCommand('keepalive', this.KEEPALIVE_COMMAND_TIMEOUT_MS);
				// if resolved, we'll get a keepalive header handled in handleMessage
			} catch (err) {
				this.log.error('Keepalive command failed or timed out, disconnecting', err);
				// on error (including timeout) perform disconnect procedure
				this.cleanupAfterDisconnectOrError('Keepalive command failed or timed out');
			}
		}, this.KEEPALIVE_INTERVAL_MS);
	}

	/**
	 * Cancels the keepalive interval timer and marks keepalive as disabled.
	 */
	private stopKeepAlive(): void {
		this.keepAliveEnabled = false;
		if (this.keepAliveInterval) {
			clearInterval(this.keepAliveInterval);
			this.keepAliveInterval = undefined;
		}
	}

	/**
	 * Cancels all pending command timers and rejects their promises with an error.
	 */
	private cleanCommandQueueAndRejectPromises(reason: string): void {
		// Reject all outstanding command promises
		const err = new Error(`Failing pending request because ${reason}`);
		for (const entry of this.commandQueue) {
			try {
				clearTimeout(entry.timer);
				entry.reject(err);
			} catch {
				// ignore individual reject errors
			}
		}
		this.commandQueue = [];
	}

	/**
	 * Triggers a full disconnect when called by a WebSocket close or error event,
	 * and forwarding the event as message including the reason.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	cleanupAfterDisconnectOrError(event: any): void {
		if (this.ws) {
			this.disconnect(event);
		}
	}

	/**
	 * Stop sending keepalives, rejects all pending commands, closes the WebSocket,
	 * and emits `disconnected` with the close reason.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	disconnect(msg: any): void {
		const reason: string = 'Closed with error/reason: ' + msg.reason ? msg.reason : msg;
		// stop keepalive timers immediately when intentionally disconnecting
		this.stopKeepAlive();
		this.cleanCommandQueueAndRejectPromises(reason);
		if (this.ws) {
			// remove event listener
			this.ws.removeEventListener('close', this.cleanupAfterDisconnectOrError);
			if (this.ws.readyState !== WebSocket.CLOSED) {
				this.ws.close();
			}
			this.ws = undefined;
		}
		this.emit('disconnected', reason);
	}

	/**
	 * Routes each incoming WebSocket frame to the correct parser
	 * (header, text, binary file, or event table) based on the protocol state machine.
	 * @param message incoming message
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private handleMessage(message: any): void {
		const isBinary = message.data instanceof ArrayBuffer;
		switch (this.nextExpectedMessageType) {
			case MessageType.HEADER: {
				if (!isBinary) {
					throw new Error('Expected binary data for header!');
				}
				const header = ParsedHeader.fromWsMessage(message.data, isBinary);
				// treat keepalive headers as a keepalive response
				if (header.messageType === MessageType.KEEPALIVE) {
					const idx = this.findCommandQueueEntryIndex('keepalive');
					if (idx !== -1) {
						const entry = this.commandQueue.splice(idx, 1)[0];
						clearTimeout(entry.timer);
						// resolve the waiting promise with the parsed header
						entry.resolve(header);
					} else {
						// No matching promise — emit event for consumers
						this.emit('keepalive', header);
					}
				}

				this.log.debug(`Received header with message type ${MessageType[header.messageType]}, estimated = ${header.isEstimated}`);

				this.emit('header', header);
				this.nextExpectedMessageType = header.getNextExpectedMessageType();
				break;
			}
			case MessageType.TEXT: {
				if (isBinary) {
					throw new Error('Expected non-binary data for text');
				}
				const textMessage = new TextMessage(message.data.toString());
				if (this.messageLog) {
					this.log.info(`Received text message: ${textMessage.toString()}`);
				}
				if (!textMessage.control) {
					this.emit('text_message', textMessage);
					this.nextExpectedMessageType = MessageType.HEADER;
					break;
				}
				// Try to find a matching pending command by control
				const idx = this.findCommandQueueEntryIndex(textMessage.control);
				if (idx !== -1) {
					const entry = this.commandQueue.splice(idx, 1)[0];
					clearTimeout(entry.timer);
					// resolve the waiting promise with the parsed TextMessage
					entry.resolve(textMessage);
				} else {
					// No matching promise — emit event for consumers
					this.emit('text_message', textMessage);
				}

				this.nextExpectedMessageType = MessageType.HEADER;
				break;
			}
			case MessageType.BINARY_FILE: {
				// TODO: Implement filename handling
				const fileMessage = new FileMessage(message.data, isBinary, this.lastFilenameRequested);

				if (this.messageLog) {
					this.log.info(`Received file message: ${fileMessage.toString()}`);
				}
				// Try to find a matching pending command by control
				const idx = this.findCommandQueueEntryIndex(fileMessage.filename);
				if (idx !== -1) {
					const entry = this.commandQueue.splice(idx, 1)[0];
					clearTimeout(entry.timer);
					// resolve the waiting promise with the parsed FileMessage
					entry.resolve(fileMessage);
				} else {
					// No matching promise — emit event for consumers
					this.emit('file_message', fileMessage);
				}

				this.nextExpectedMessageType = MessageType.HEADER;
				break;
			}

			case MessageType.ETABLE_VALUES: {
				const events = this.parseEventTables(LoxValueEvent, message.data, isBinary);
				this.emit('event_table_values', events);
				this.nextExpectedMessageType = MessageType.HEADER;
				break;
			}
			case MessageType.ETABLE_TEXT: {
				const events = this.parseEventTables(LoxTextEvent, message.data, isBinary);
				this.emit('event_table_text', events);
				this.nextExpectedMessageType = MessageType.HEADER;
				break;
			}
			case MessageType.ETABLE_DAYTIMER: {
				const events = this.parseEventTables(LoxDayTimerEvent, message.data, isBinary);
				this.emit('event_table_day_timer', events);
				this.nextExpectedMessageType = MessageType.HEADER;
				break;
			}
			case MessageType.ETABLE_WEATHER: {
				const events = this.parseEventTables(LoxWeatherEvent, message.data, isBinary);
				this.emit('event_table_weather', events);
				this.nextExpectedMessageType = MessageType.HEADER;
				break;
			}
		}
	}

	/**
	 * Parses a binary event-table payload into an array of type LoxEvent.
	 * @param ctorType constrictor of Event
	 * @param data message data
	 * @param isBinary true for binary message, otherwise false
	 * @returns event table
	 */
	private parseEventTables<T extends LoxEvent>(ctorType: LoxEventCtor<T>, data: ArrayBuffer, isBinary: boolean): T[] {
		if (!isBinary) {
			throw new Error('Expected binary data for event table');
		}

		const buffer = Buffer.from(data); /* Convert ArrayBuffer to buffer of type Buffer */
		if (!Buffer.isBuffer(buffer)) {
			throw new Error('data is not a buffer');
		}

		// loop through data buffer
		const items: T[] = [];
		let idx = 0;
		while (idx < buffer.length) {
			const event = new ctorType(buffer, idx);
			items.push(event);
			idx += event.data_length();
		}
		return items;
	}

	/**
	 * Sends the command over the WebSocket with AES-256-CBC encryption
	 * and returns the matching text response.
	 * @param command command to be sent
	 * @param timeoutMs (optional) timeout in ms for the WebSocket connected 
	 * @returns text message of type TextMessage
	 */
	async sendEncryptedTextCommand(command: string, timeoutMs: number = this.COMMAND_TIMEOUT): Promise<TextMessage> {
		return this.sendCommand<TextMessage>(command, true, timeoutMs);
	}

	/**
	 * Sends the command over the WebSocket in plain text
	 * and returns the matching text response.
	 * @param command command to be sent
	 * @param timeoutMs (optional) timeout in ms for the WebSocket connected 
	 * @returns text message of type TextMessage
	 */
	async sendUnencryptedTextCommand(command: string, timeoutMs: number = this.COMMAND_TIMEOUT): Promise<TextMessage> {
		return this.sendCommand<TextMessage>(command, false, timeoutMs);
	}

	/**
	 * Sends a visualization-password-protected command over the WebSocket in plain text,
	 * where the visualization-password is passed as hash
	 * @param uuid UUID of the control
	 * @param command command to be sent
	 * @param visuPw visualization password
	 * @param encrypt (optional) encryption set to true for Gen1, false for Gen2 miniserver (default = false)
	 * @param timeoutMs (optional) timeout in ms for the WebSocket connected 
	 * @returns text message of type TextMessage
	 */
	async sendSecuredTextCommand(uuid: string, command: string, visuPw: string, encrypt = false, timeoutMs: number = this.COMMAND_TIMEOUT): Promise<TextMessage> {
		const { key, salt, hashAlg } = await this.LoxClient.auth.getVisuSalt();
		const visuPwHash = hash(`${visuPw}:${salt}`, hashAlg).toUpperCase();
		const visuHash = hmacHash(visuPwHash, Buffer.from(key, 'hex'), hashAlg);
		const securedCommand = `jdev/sps/ios/${visuHash}/${uuid}/${command}`;
		return this.sendCommand<TextMessage>(securedCommand, encrypt, timeoutMs);
	}

	/**
	 * Requests a file from the Miniserver and returns the binary or text payload.
	 * @param filename file requested
	 * @param timeoutMs (optional) timeout in ms for the WebSocket connected
	 * @returns file of type FileMessage
	 */
	async sendUnencryptedFileCommand(filename: string, timeoutMs: number = this.COMMAND_TIMEOUT): Promise<FileMessage> {
		this.lastFilenameRequested = filename;
		return this.sendCommand<FileMessage>(filename, false, timeoutMs);
	}

	/**
	 * Sends a command over the WebSocket and returns a promise that resolves
	 * with the matching response or rejects after a given timeout.
	 * @param command command to be sent
	 * @param encrypt (optional) encryption set to true for Gen1, false for Gen2 miniserver (default = false)
	 * @param timeoutMs (optional) timeout in ms for the WebSocket connected
	 * @returns file or text of type FileMessage or TextMessage respectively
	 */
	async sendCommand<T extends FileMessage | TextMessage>(command: string, encrypt = false, timeoutMs: number = this.COMMAND_TIMEOUT): Promise<T> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error('Cannot send websocket command, readystate is not open');
		}

		return new Promise<T>((resolve, reject) => {
			// create timeout to reject the promise if no matching text arrives
			const timer = setTimeout(() => {
				// remove from queue if still present
				const i = this.findCommandQueueEntryIndex(command);
				if (i !== -1) this.commandQueue.splice(i, 1);
				reject(new Error(`No answer for command=${command} after ${timeoutMs}ms`));
			}, timeoutMs);

			const commandDefinition = {
				originalCommand: command,
				encryptedCommand: encrypt ? this.LoxClient.auth.commandEncryption.getEncryptedCommand(command) : undefined};

			// enqueue the pending command
			this.commandQueue.push({
				command: commandDefinition,
				encrypted: encrypt,
				resolve,
				reject,
				timer
			});

			// finally, send the command string over the websocket
			try {
				if (commandDefinition.encryptedCommand) {
					if (this.messageLog) {
						this.log.info(`Sending encrypted command ${command} (${maskEnc(commandDefinition.encryptedCommand)})`);
					}
					this.ws?.send(commandDefinition.encryptedCommand);
				} else {
					if (command !== 'keepalive') {
						if (this.messageLog) {
							this.log.info(`Sending unencrypted command ${command}`);
						}
					}
					this.ws?.send(command);
				}
			} catch (err) {
				// remove queue entry & clear timer
				const i = this.findCommandQueueEntryIndex(command);
				if (i !== -1) {
					const entry = this.commandQueue.splice(i, 1)[0];
					clearTimeout(entry.timer);
				}
				reject(err);
			}
		});
	}

	/**
	 * Finds the index of a pending queue entry whose original or encrypted command.
	 * @param command command to be sent
	 * @returns index in queue
	 */
	private findCommandQueueEntryIndex(command: string): number {
		const i = this.commandQueue.findIndex( (q) => (q.command.encryptedCommand && decodeURIComponent(q.command.encryptedCommand) === command) ||
			(q.command.encryptedCommand &&decodeURIComponent(q.command.encryptedCommand).replace('jdev', 'dev') === command) ||
			q.command.originalCommand === command || q.command.originalCommand.replace('jdev', 'dev') === command);
		return i;
	}

	/**
	 * Registers a typed event listener for the given event key of type WebSocketConnectionEvents.
	 * @param event event of type WebSocketConnectionEvents
	 * @param listener listener callback 
	 */
	on<K extends keyof WebSocketConnectionEvents>(event: K, listener: WebSocketConnectionEvents[K]): void {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.addEventListener(event as string, listener as (...args: any[]) => void);
	}

	/**
	 * Dispatches a typed CustomEvent.
	 * @param event incoming event of type WebSocketConnectionEvents
	 * @param args optional arguments, where first argument is passed as CustomEvent event detail
	 * @returns false if event is cancelable. Otherwise true.
	 */
	emit<K extends keyof WebSocketConnectionEvents>(event: K, ...args: Parameters<WebSocketConnectionEvents[K]>): boolean {
		return this.dispatchEvent(new CustomEvent(event, { detail: args[0] }));
	}
}

export default WebSocketConnection;
