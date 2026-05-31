import UUID from '../WebSocketMessages/UUID';
import LoxEnrichableEvent from './LoxEnrichableEvent';

/**
 * Class representing the Loxone daytimer event received as ETABLE_DAYTIMER binary;
 * Holds a default value and a list of scheduled time-range entries
 */
class LoxDayTimerEvent extends LoxEnrichableEvent {
	typeName = LoxDayTimerEvent.name;
	defValue: number;
	entries: number;
	entry: { mode: number; from: number; to: number; needActivate: number; value: number }[];

	/**
	 * Parses a daytimer event, reading the default value and all scheduled entries.
	 * @param binaryData data of type Buffer
	 * @param offset offset
	 */
	constructor(binaryData: Buffer, offset: number) {
		super(binaryData, offset);

		let offset_add = offset;
		this.uuid = new UUID(binaryData, offset_add);
		offset_add += this.uuid.data_length;
		this.defValue = binaryData.readDoubleLE(offset_add);
		offset_add += 8;
		this.entries = binaryData.readInt32LE(offset_add);
		offset_add += 4;

		this.entry = [];

		for (let i = 0; i < this.entries; i++) {
			this.entry.push({
				mode: binaryData.readInt32LE(offset_add),
				from: binaryData.readInt32LE(offset_add + 4),
				to: binaryData.readInt32LE(offset_add + 8),
				needActivate: binaryData.readInt32LE(offset_add + 12),
				value: binaryData.readDoubleLE(offset_add + 16)
			});
			offset_add += 24;
		}
	}

	/** 
	 * Returns the total byte length of this event: 
	 * UUID + 8-byte default + 4-byte entry count + 24 bytes per entry.
	 * @returns total byte length 
	 */
	override data_length(): number {
		return this.uuid.data_length + 8 + 4 + this.entries * 24;
	}

	/**
	 * Returns the UUID string as the event path (daytimer events
	 * are not enriched with room/control names).
	 * @returns event UUID as string
	 */
	override toPath(): string {
		return this.uuid.stringValue;
	}

	/** 
	 * Formats a minute-of-day value as `HH:MM`.
	 * @param minutes as numeric format , could exceed 60 minutes
	 * @returns minutes in `HH:MM` format
	 */
	formatMinutes(minutes: number): string {
		const hour = ('00' + Math.floor(minutes / 60)).slice(-2);
		const minute = ('00' + (minutes % 60)).slice(-2);
		return hour + ':' + minute;
	}

	/**
	 * Returns a multi-line string listing the default value and all
	 * scheduled entries with formatted time ranges.
	 */
	override toString(): string {
		let str = '{defValue: ' + this.defValue + ', entries: ' + this.entries + ', entry: [\n';
		for (let i = 0; i < this.entries; i++) {
			const entry = this.entry[i];
			str += '{mode: ' + entry.mode;
			str += ', from: ' + this.formatMinutes(entry.from);
			str += ', to: ' + this.formatMinutes(entry.to);
			str += ', needActivate: ' + entry.needActivate;
			str += ', value: ' + entry.value;
			str += '}\n';
		}
		str += '], uuid: ' + this.uuid.stringValue + '}';
		return str;
	}
}

export default LoxDayTimerEvent;
