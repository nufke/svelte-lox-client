import LoxClientState from './LoxClientState';
import LoxTextEvent from './LoxEvents/LoxTextEvent';
import LoxValueEvent from './LoxEvents/LoxValueEvent';
import LoxDayTimerEvent from './LoxEvents/LoxDayTimerEvent';
import LoxWeatherEvent from './LoxEvents/LoxWeatherEvent';
import FileMessage from './WebSocketMessages/FileMessage';
import TextMessage from './WebSocketMessages/TextMessage';

/**
 * Interface definition of LoxClientEvent.
 * Used to provide strongly-typed `on` and `emit` overloadss for typed event map for LoxClient
 */
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
	event_daytimer: (event: LoxDayTimerEvent) => void;
	event_weather: (event: LoxWeatherEvent) => void;
}
