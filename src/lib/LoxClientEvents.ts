import LoxClientState from './LoxClientState';
import LoxTextEvent from './LoxEvents/LoxTextEvent';
import LoxValueEvent from './LoxEvents/LoxValueEvent';
import FileMessage from './WebSocketMessages/FileMessage';
import TextMessage from './WebSocketMessages/TextMessage';

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
