import LoxDayTimerEvent from '../LoxEvents/LoxDayTimerEvent';
import LoxTextEvent from '../LoxEvents/LoxTextEvent';
import LoxValueEvent from '../LoxEvents/LoxValueEvent';
import LoxWeatherEvent from '../LoxEvents/LoxWeatherEvent';
import FileMessage from '../WebSocketMessages/FileMessage';
import ParsedHeader from '../WebSocketMessages/ParsedHeader';
import TextMessage from '../WebSocketMessages/TextMessage';

export interface WebSocketConnectionEvents {
	connected: () => void;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	disconnected: (reason: any) => void;
	error: (err: Error) => void;
	header: (header: ParsedHeader) => void;
	keepalive: (header: ParsedHeader) => void;
	text_message: (text: TextMessage) => void;
	file_message: (file: FileMessage) => void;
	event_table_values: (eventTable: LoxValueEvent[]) => void;
	event_table_text: (eventTable: LoxTextEvent[]) => void;
	event_table_day_timer: (eventTable: LoxDayTimerEvent[]) => void;
	event_table_weather: (eventTable: LoxWeatherEvent[]) => void;
}
