import WebSocketConnection from './Services/WebSocketConnection';
import { type WebSocketConnectionEvents } from './Services/WebSocketConnectionEvents';
import Auth from './Services/Auth';
import { LoxClientOptions } from './LoxClientOptions';
import LoxClientState from './LoxClientState';
import AutoReconnect from './Services/AutoReconnect';
import Logger from './Utils/Logger';
import { LogLevel } from './Utils/Logger';
import TextMessage from './WebSocketMessages/TextMessage';
import FileMessage from './WebSocketMessages/FileMessage';
import LoxValueEvent from './LoxEvents/LoxValueEvent';
import LoxTextEvent from './LoxEvents/LoxTextEvent';
import LoxEnrichableEvent from './LoxEvents/LoxEnrichableEvent';
import { type LoxClientEvents } from './LoxClientEvents';
import Control from './Structure/Control';
import State from './Structure/State';
import Room from './Structure/Room';
import UUID from './WebSocketMessages/UUID';

export class LoxClient extends EventTarget {
	private readonly connection: WebSocketConnection;
	readonly auth: Auth;
	private readonly hostName: string;
	private readonly deviceId: string;
	private autoReconnect: AutoReconnect;
	private readonly COMMAND_TIMEOUT = 15000;
	private readonly log: Logger;
	private _state: LoxClientState = LoxClientState.disconnected;
	private readonly uuidWatchlist = new Set<string>();
	private isGen2 = false;
	private eventsRegistered = false;
	private isStructureFileParsed = false;
	public options: LoxClientOptions;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public structureFile: any = undefined;

	/**
	 * Gets the current state of the client
	 * @returns The current state of the client
	 */
	public get state(): LoxClientState {
		return this._state;
	}

	/**
	 * A mapping of control UUIDs to Controls
	 */
	public readonly controls = new Map<string, Control>();

	/**
	 * A mapping of state UUIDs to States
	 */
	public readonly states = new Map<string, State>();

	/**
	 * A mapping of room UUIDs to Rooms
	 */
	public readonly rooms = new Map<string, Room>();

	/**
	 * Class to establish communication with Miniserver
	 * @param hostName Hostname or IP and port (incl http(s))
	 * @param userName Username to be used
	 * @param password Password for the user
	 * @param deviceId Unique device/app ID
	 * @param clientOptions options
	 */
	constructor(
		hostName: string,
		userName: string,
		password: string,
		deviceId: string,
		clientOptions: Partial<LoxClientOptions> | LoxClientOptions = new LoxClientOptions()
	) {
		super();
		const options = clientOptions instanceof LoxClientOptions ? clientOptions : new LoxClientOptions(clientOptions);
		this.hostName = hostName.replace(/\/$/, '');
		this.deviceId = deviceId;
		this.log = new Logger(options.logLevel);
		this.connection = new WebSocketConnection(this, this.log, this.hostName, this.COMMAND_TIMEOUT, options.messageLogEnabled);
		this.auth = new Auth(this.log, this.connection, this.hostName, userName, password, deviceId);
		this.autoReconnect = new AutoReconnect(this, this.log, options.autoReconnectEnabled);
		this.options = options;
	}

	/**
	 * Initiates connection and triggers authentication
	 */
	async connect(existingToken?: string) {
		if (this._state !== LoxClientState.disconnected && this._state !== LoxClientState.error) {
			this.log.warn('Not in disconnected or error state, ignoring connect call');
			return;
		}
		if (this.autoReconnect.autoReconnectingInProgress) {
			this.setState(LoxClientState.reconnecting);
		} else {
			this.setState(LoxClientState.connecting);
		}

		try {
			// 1. register events
			this.registerEvents();

			// 2. check version and https
			await this.checkVersion();

			// 3. create websocket connection and connect
			await this.connection?.connect();
			this.log.info(`Miniserver at ${this.hostName} connected`);
			this.setState(LoxClientState.connected);

			// 4. perform auth
			this.setState(LoxClientState.authenticating);
			await this.auth.authenticate(existingToken);
			this.setState(LoxClientState.authenticated);
			this.log.info('Authentication completed');
			this.emit('authenticated');

			// 5. enable keep-alive
			if (this.options.keepAliveEnabled) {
				this.connection?.enableKeepAlive();
			}
			this.setState(LoxClientState.ready);
			this.log.info('LoxClient is ready to receive commands');
			this.emit('ready');

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			this.log.error(`Could not connect: ${error.message} - ${error.cause}`, error);
			this.setState(LoxClientState.error);
			await this.autoReconnect.startAutoReconnect(existingToken);
		}
	}

	/**
	 * Gets the structure file from Miniserver
	 * @returns the Miniserver LoxAPP3.json structure file
	 */
	async getStructureFile() {
		try {
			const structureFileMessage = await this.sendFileCommand('data/LoxAPP3.json');
			this.structureFile = structureFileMessage.data;
			this.log.info(
				`Received structure file with last modified: ${this.structureFile.lastModified}`
			);
			return this.structureFile;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			this.log.error(`Could not get structure file: ${error.message} - ${error.cause}`, error);
			throw new Error('Could not get structure file', { cause: error as Error });
		}
	}

	/**
	 * Enables binary streaming of value and text updates
	 */
	async enableUpdates() {
		try {
			this.ensureReadyState('Not connected and authenticated, cannot enable updates');
			await this.connection.sendUnencryptedTextCommand('jdev/sps/enablebinstatusupdate');
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			this.log.error(`Could not enable updates: ${error.message} - ${error.cause}`, error);
			throw new Error('Could not enable updates', { cause: error as Error });
		}
	}

	/**
	 * Disconnects the client, optionally preserving the token
	 * @param preserveToken Whether to preserve the token after disconnecting or not, if omitted, defaults to false
	 */
	async disconnect(preserveToken = false) {
		try {
			this.setState(LoxClientState.disconnecting);

			this.autoReconnect.disableAutoReconnect();

			// stop token refresh timer
			this.auth.tokenHandler.clearScheduledRefresh();

			// kill (free up) token
			if (!preserveToken) {
				await this.auth.tokenHandler.killToken();
			}

			// disconnect websocket
			this.connection?.cleanupAfterDisconnectOrError('Disconnect initiated');
			this.setState(LoxClientState.disconnected);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			this.log.error(`Error while disconnecting: ${error.message} - ${error.cause}`, error);
		}
	}

	/**
	 * Checks whether the token used is still valid
	 */
	async checkToken(token?: string) {
		try {
			this.ensureReadyState('Not connected and authenticated, cannot check token');
			await this.auth.tokenHandler.checkToken(token);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			this.log.error(`Could not check token: ${error.message} - ${error.cause}`, error);
			throw new Error('Could not check token', { cause: error as Error });
		}
	}

	/**
	 * Refreshes the token if it is still valid. Acquires a new token if token is not valid any more
	 */
	async refreshToken() {
		try {
			this.ensureReadyState('Not connected and authenticated, cannot refresh token');
			await this.auth.tokenHandler.refreshToken();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			this.log.error(`Could not refresh token: ${error.message} - ${error.cause}`, error);
			throw new Error('Could not refresh token', { cause: error as Error });
		}
	}

	/**
	 * Sends a text command to the Miniserver. If a Miniserver Gen.1 is used, command encryption will be used.
	 * @param command The command to send
	 * @param timeoutOverride (optional) timeoutoverride for this command
	 * @returns The response from the Miniserver
	 */
	async sendTextCommand(
		command: string,
		timeoutOverride = this.COMMAND_TIMEOUT
	): Promise<TextMessage> {
		try {
			this.ensureReadyState('Not connected and authenticated, cannot send command');
			const encrypted = !this.isGen2;
			return await this.connection?.sendCommand(command, encrypted, timeoutOverride);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			this.log.error(
				`${command} - Could not send text command: ${error.message} - ${error.cause}`,
				error
			);
			throw new Error(`${command} - Could not send text command`, { cause: error as Error });
		}
	}

	/**
	 * Gets a file from the Miniserver.
	 * @param filename Name of the file to retrieve
	 * @param timeoutOverride (optional) timeoutoverride for this command
	 * @returns The file contents as a FileMessage
	 */
	async sendFileCommand(filename: string, timeoutOverride = this.COMMAND_TIMEOUT): Promise<FileMessage> {
		try {
			this.ensureReadyState('Not connected and authenticated, cannot send command');
			return await this.connection?.sendUnencryptedFileCommand(filename, timeoutOverride);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			this.log.error(`${filename} - Could not send file command: ${error.message} - ${error.cause}`, error);
			throw new Error(`${filename} - Could not send file command`, { cause: error as Error });
		}
	}

	/**
	 * Executes a command on the control identified by the UUID.
	 * @param uuid The UUID of the control
	 * @param command The command to execute
	 * @param timeoutOverride (optional) timeoutoverride for this command
	 * @returns The response from the Miniserver
	 */
	async control(uuid: string, command: string, timeoutOverride = this.COMMAND_TIMEOUT): Promise<TextMessage> {
		try {
			this.ensureReadyState('Not connected and authenticated, cannot send command');
			if (this.isStructureFileParsed && !this.controls.has(uuid)) {
				this.log.warn(`Control UUID '${uuid}' is not present in the structure file, control command will likely fail`);
			}

			const encrypted = !this.isGen2;
			const fullCommand = `jdev/sps/io/${uuid}/${command}`;
			const response = await this.connection.sendCommand<TextMessage>(fullCommand, encrypted, timeoutOverride);
			if (response.code === 404) {
				this.log.error(`Miniserver control '${uuid}' not found`);
			}	else if (response.code !== 200) {
				this.log.error(`${uuid}/${command} - unknown error, response was not 200 OK, but ${response.code}`);
			}
			if (response.value === '0') {
				this.log.error(`Miniserver command '${command}' invalid, response indicates unsuccessful execution (response.value = 0)`);
			}
			return response;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			this.log.error(`${uuid}/${command} - Could not execute control command: ${error.message} - ${error.cause}`, error);
			throw new Error(`${uuid}/${command} - Could not execute control command`, {
				cause: error as Error
			});
		}
	}

	/**
	 * Parses the structure file and extracts relevant information. After calling this event, emitted event updates will
	 * contain enriched information about the room, control, and state names.
	 */
	async parseStructureFile() {
		if (!this.structureFile) {
			this.log.warn('No structure file loaded, trying to get it');
			await this.getStructureFile();
		}

		this.log.info('Parsing structure file...');

		this.log.info('Processing rooms...');
		for (const uuid in this.structureFile.rooms) {
			const room = this.structureFile.rooms[uuid];
			this.log.debug(`Found room with UUID ${uuid}, name ${room.name}`);
			this.rooms.set(uuid, new Room(UUID.fromString(uuid), room.name));
		}
		this.log.info(`Found ${this.rooms.size} rooms in the structure file.`);

		// create a map of potential event UUIDs to room and control names with state names
		for (const controlUuidString in this.structureFile.controls) {
			const controlSection = this.structureFile.controls[controlUuidString];
			if (!controlSection.type || controlSection.type === 'SystemScheme') {
				continue;
			}
			// lookup room, and if not found, fallback on unassigned (first) roon
			let room;
			if (!controlSection.room || !this.rooms.has(controlSection.room)) {
				this.log.error(`Could not find room for control '${controlSection.name}'. Fallback to room '${this.rooms.values().next().value?.name}'`);
				room = this.rooms.values().next().value;
			} else {
				room = this.rooms.get(controlSection.room);
			}
			if (!room) {
				throw new Error(`Could not find room with UUID ${controlSection.room}`);
			}
			// create control
			const control = new Control(controlUuidString, controlSection, room);
			this.controls.set(controlUuidString, control);
			for (const stateKey in controlSection.states) {
				const stateUuidObj = controlSection.states[stateKey];
				if (Array.isArray(stateUuidObj)) {
					// in case we get an array of UUIDs, unroll these and add the index to the key name
					for (let i = 0; i < stateUuidObj.length; i++) {
						const stateUuid = UUID.fromString(stateUuidObj[i]);
						const state = new State(stateUuid, stateKey + String(i), control);
						this.states.set(stateUuidObj[i], state);
						control.addState(state);
					}
				} else {
					// not an array, assume single UUID
					const stateUuid = UUID.fromString(stateUuidObj);
					const state = new State(stateUuid, stateKey, control);
					this.states.set(stateUuidObj, state);
					control.addState(state);
				}
			}
			// parse subcontrols, if any
			if (controlSection.subControls) {
				for (const subControlUuidString in controlSection.subControls) {
					const subControlSection = controlSection.subControls[subControlUuidString];
					const subControl = new Control(subControlUuidString, subControlSection, room, control);
					this.controls.set(subControlUuidString, subControl);
					for (const stateKey in subControlSection.states) {
						const stateUuidString = subControlSection.states[stateKey];
						const stateUuid = UUID.fromString(stateUuidString);
						const state = new State(stateUuid, stateKey, subControl);
						this.states.set(stateUuidString, state);
						subControl.addState(state);
					}
				}
			}
		}
		this.log.info(`Found ${this.controls.size} controls in the structure file.`);
		this.log.info(`Found ${this.states.size} states in the structure file.`);
		this.isStructureFileParsed = true;
	}

	/**
	 * Sets the log level for the client.
	 * @param level The log level to set
	 */
	setLogLevel(level: LogLevel) {
		this.log.setLogLevel(level);
	}

	private registerEvents() {
		if (this.eventsRegistered) {
			return;
		}

		this.connection.on('disconnected', (reason) => {
			this.log.warn(`Disconnected: ${JSON.stringify(reason)}`);
			if (this._state !== LoxClientState.error) {
				this.setState(LoxClientState.disconnected);
			}
		});

		this.connection.on('error', (error: Error) => {
			this.log.error(`Connection error: ${error.message}`, error);
			this.setState(LoxClientState.error);
		});

		if (this.autoReconnect.autoReconnectEnabled) {
			 
			this.connection.on('disconnected', async () => {
				try {
					await this.autoReconnect.startAutoReconnect();
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
				} catch (error: any) {
					this.log.error(`Failed to start auto reconnect: ${error?.message}`, error);
				}
			});
			this.connection.on('connected', async () => {
				try {
					this.autoReconnect.stopAutoReconnect();
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
				} catch (error: any) {
					this.log.error(`Failed to stop auto reconnect: ${error?.message}`, error);
				}
			});
		}

		// forward events from the underlying connection to this client
		const EVENTS = ['connected', 'disconnected', 'error', 'text_message', 'file_message'];

		for (const event of EVENTS) {
			// forward any args from the connection to the client emitter
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.connection.on(event as keyof WebSocketConnectionEvents, (...args: any[]) =>
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				this.emit(event as keyof LoxClientEvents, ...(args as any))
			);
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.connection.on('event_table_values', (event: any) => {
			this.filterAndLogAndEmitEvents(event.detail);
		});
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.connection.on('event_table_text', (event: any) => {
			this.filterAndLogAndEmitEvents(event.detail);
		});
		this.eventsRegistered = true;
	}

	private filterAndLogAndEmitEvents(eventTable: (LoxValueEvent | LoxTextEvent)[]) {
		// filter by watchlist
		if (this.uuidWatchlist.size > 0) {
			eventTable = eventTable.filter((event) => this.uuidWatchlist.has(event.uuid.stringValue));
		}
		eventTable.forEach((event) => {
			// enrich if we have the data
			if (this.isStructureFileParsed) {
				event = this.enrichEvent(event);
				if (this.options.maintainLatestEvents) {
					const state = this.states.get(event.uuid.stringValue);
					if (state) {
						state.latestEvent = event;
					}
				}
			}
			if (this.options.messageLogEnabled && this.uuidWatchlist.size > 0) {
				this.log.debug(`Event: ${event.toString()}`);
			}
			if (event instanceof LoxValueEvent) {
				this.emit('event_value', event);
			} else if (event instanceof LoxTextEvent) {
				this.emit('event_text', event);
			}
		});
	}

	/**
	 * Adds one or more UUIDs to the watch list. Value and text events will only be emitted for these UUIDs.
	 * If the watchlist is empty, all events will be emitted.
	 * @param uuid The UUID or array of UUIDs to add
	 */
	addUuidToWatchList(uuid: string | string[]) {
		const ids = Array.isArray(uuid) ? uuid : [uuid];
		for (const id of ids) {
			if (this.isStructureFileParsed && !this.states.has(id)) {
				this.log.warn(`UUID ${id} is not present in the structure file`);
			}
			this.uuidWatchlist.add(id);
		}
	}

	/**
	 * Removes one or more UUIDs from the watch list.
	 * @param uuid The UUID or array of UUIDs to remove
	 */
	removeUuidFromWatchList(uuid: string | string[]) {
		const ids = Array.isArray(uuid) ? uuid : [uuid];
		ids.forEach((id) => this.uuidWatchlist.delete(id));
	}

	private enrichEvent<T extends LoxEnrichableEvent>(event: T): T {
		if (!this.isStructureFileParsed) {
			return event;
		}

		const state = this.states.get(event.uuid.stringValue);
		if (!state) {
			return event;
		}
		event.state = state;
		event.isEnriched = true;
		return event;
	}

	private async checkVersion() {
		this.log.info('Checking Miniserver version...');
		const response = await fetch(`${this.hostName}/jdev/cfg/apiKey`);
		if (response.status === 503) {
			throw new Error('Miniserver is rebooting');
		}
		if (!response.ok) {
			this.log.error(`Failed to check version: ${response.status}`, response);
			throw new Error('Failed to check version');
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data: any = await response.json();
		const jsonString = data.LL.value.replace(/'/g, '"');
		const dataJson = JSON.parse(jsonString);
		const version = dataJson.version;
		this.log.info(`Miniserver version is ${version}`);
		const versionParts = version.split('.');
		if (versionParts[0] < 11 || (versionParts[0] === 11 && versionParts[1] < 2)) {
			throw new Error(`Unsupported firmware version, needs to be at least 11.2: ${version}`);
		}

		if (dataJson.httpsStatus) {
			this.isGen2 = true;
		}
	}

	private ensureReadyState(errorReason: string) {
		if (this._state !== LoxClientState.ready) {
			throw new Error(`Client is not in an expected state - ${errorReason}`);
		}
	}

	private setState(state: LoxClientState) {
		if (this._state !== state) {
			this._state = state;
			this.log.info(`State changed to: ${state}`);
			this.emit('stateChanged', state);
		}
	}

	// Compatibility layer for app to emit events
	on<K extends keyof LoxClientEvents>(event: K, listener: LoxClientEvents[K]) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.addEventListener(event as string, listener as (...args: any[]) => void);
	}

	emit<K extends keyof LoxClientEvents>(event: K, ...args: Parameters<LoxClientEvents[K]>): boolean {
		return this.dispatchEvent(new CustomEvent(event, { detail: args[0] }));
	}
}

export default LoxClient;
