import UUID from '../WebSocketMessages/UUID';
import LoxEnrichableEvent from './LoxEnrichableEvent';

class LoxDayTimerEvent extends LoxEnrichableEvent {
	typeName = LoxDayTimerEvent.name;
	defValue: number;
	entries: number;
	entry: { mode: number; from: number; to: number; needActivate: number; value: number }[];

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

	override data_length(): number {
		return this.uuid.data_length + 8 + 4 + this.entries * 24;
	}

	override toPath(): string {
		return this.uuid.stringValue;
	}

	formatMinutes(minutes: number): string {
		const hour = ('00' + Math.floor(minutes / 60)).slice(-2);
		const minute = ('00' + (minutes % 60)).slice(-2);
		return hour + ':' + minute;
	}

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
