import LoxClientState from './LoxClientState.js';
import LoxTextEvent from './LoxEvents/LoxTextEvent.js';
import LoxValueEvent from './LoxEvents/LoxValueEvent.js';
import FileMessage from './WebSocketMessages/FileMessage.js';
import TextMessage from './WebSocketMessages/TextMessage.js';

export interface LoxClientEvents {
	connected: () => void;
	disconnected: (reason: string) => void;
	authenticated: () => void;
	ready: () => void;
	error: (err: Error) => void;
	text_message: (text: TextMessage) => void;
	file_message: (file: FileMessage) => void;
	stateChanged: (newState: LoxClientState) => void;
	event_value: (event: LoxValueEvent) => void;
	event_text: (event: LoxTextEvent) => void;
}
