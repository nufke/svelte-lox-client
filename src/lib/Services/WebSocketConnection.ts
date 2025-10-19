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
import { maskEnc } from '../Utils/Masker';
import { type WebSocketConnectionEvents } from './WebSocketConnectionEvents.js';

// Generic pending queue entry for text/file command promises
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

class WebSocketConnection extends EventTarget {
	private nextExpectedMessageType: MessageType = MessageType.HEADER;
	private ws: WebSocket | undefined;
	private host: string;
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
	private messageLog: boolean;

	constructor(LoxClient: LoxClient, host: string, commandTimeout: number, messageLog: boolean) {
		super();
		this.LoxClient = LoxClient;
		this.host = host;
		this.COMMAND_TIMEOUT = commandTimeout;
		this.messageLog = messageLog;
	}

	async connect() {
		this.ws = new WebSocket(`ws://${this.host}/ws/rfc6455`);
		this.ws.binaryType = 'arraybuffer'; /* for binary data get ArrayBuffer instead of Blob */

		this.ws.addEventListener('open', () => {
			this.emit('connected');
		});

		this.ws.addEventListener('close', this.cleanupAfterDisconnectOrError);
		this.ws.addEventListener('error', this.cleanupAfterDisconnectOrError);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.ws.addEventListener('message', (message: any) => {
			this.handleMessage(message);
		});

		return new Promise((resolve, reject) => {
			this.ws?.addEventListener('open', resolve);
			this.ws?.addEventListener('error', reject);
		});
	}

	enableKeepAlive() {
		if (this.keepAliveEnabled) return;
		this.keepAliveEnabled = true;

		// send keepalive periodically; rely on sendUnencryptedTextCommand to reject on timeout
		this.keepAliveInterval = setInterval(async () => {
			if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

			try {
				// send unencrypted keepalive and wait for response or timeout
				await this.sendUnencryptedTextCommand('keepalive', this.KEEPALIVE_COMMAND_TIMEOUT_MS);
				// if resolved, we'll get a keepalive header handled in handleMessage
			} catch (err) {
				console.error('Keepalive command failed or timed out, disconnecting', err);
				// on error (including timeout) perform disconnect procedure
				this.cleanupAfterDisconnectOrError('Keepalive command failed or timed out');
			}
		}, this.KEEPALIVE_INTERVAL_MS);
	}

	private stopKeepAlive() {
		this.keepAliveEnabled = false;
		if (this.keepAliveInterval) {
			clearInterval(this.keepAliveInterval);
			this.keepAliveInterval = undefined;
		}
	}

	private cleanCommandQueueAndRejectPromises(reason: string) {
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

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	cleanupAfterDisconnectOrError(event: any) {
		if (this.ws) {
			this.disconnect(event);
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	disconnect(msg: any) {
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

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	handleMessage(message: any) {
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

				// console.debug(`  Received header with message type ${MessageType[header.messageType]}, estimated = ${header.isEstimated}`);

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
					console.info(`Received text message: ${textMessage.toString()}`);
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
					console.info(`Received file message: ${fileMessage.toString()}`);
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

	async sendEncryptedTextCommand(command: string, timeoutMs: number = this.COMMAND_TIMEOUT): Promise<TextMessage> {
		return this.sendCommand<TextMessage>(command, true, timeoutMs);
	}

	async sendUnencryptedTextCommand(command: string, timeoutMs: number = this.COMMAND_TIMEOUT): Promise<TextMessage> {
		return this.sendCommand<TextMessage>(command, false, timeoutMs);
	}

	async sendUnencryptedFileCommand(filename: string, timeoutMs: number = this.COMMAND_TIMEOUT): Promise<FileMessage> {
		this.lastFilenameRequested = filename;
		return this.sendCommand<FileMessage>(filename, false, timeoutMs);
	}

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
						console.info(`Sending encrypted command ${command} (${maskEnc(commandDefinition.encryptedCommand)})`);
					}
					this.ws?.send(commandDefinition.encryptedCommand);
				} else {
					if (command !== 'keepalive') {
						if (this.messageLog) {
							console.info(`Sending unencrypted command ${command}`);
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

	private findCommandQueueEntryIndex(command: string): number {
		const i = this.commandQueue.findIndex( (q) => (q.command.encryptedCommand && decodeURIComponent(q.command.encryptedCommand) === command) ||
			(q.command.encryptedCommand &&decodeURIComponent(q.command.encryptedCommand).replace('jdev', 'dev') === command) ||
			q.command.originalCommand === command || q.command.originalCommand.replace('jdev', 'dev') === command);
		return i;
	}

	on<K extends keyof WebSocketConnectionEvents>(event: K, listener: WebSocketConnectionEvents[K]) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.addEventListener(event as string, listener as (...args: any[]) => void);
	}

	emit<K extends keyof WebSocketConnectionEvents>(event: K, ...args: Parameters<WebSocketConnectionEvents[K]>): boolean {
		return this.dispatchEvent(new CustomEvent(event, { detail: args[0] }));
	}
}

export default WebSocketConnection;
