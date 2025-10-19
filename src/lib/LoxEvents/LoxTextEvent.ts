import UUID from '../WebSocketMessages/UUID';
import LoxEnrichableEvent from './LoxEnrichableEvent';

class LoxTextEvent extends LoxEnrichableEvent {
	typeName = LoxTextEvent.name;
	uuidIcon: UUID;
	textLength: number;
	text: string;

	constructor(binaryData: Buffer, offset: number) {
		super(binaryData, offset);

		let offset_add = offset;
		offset_add += this.uuid.data_length;
		this.uuidIcon = new UUID(binaryData, offset_add);
		offset_add += this.uuidIcon.data_length;
		this.textLength = binaryData.readUInt32LE(offset_add);
		offset_add += 4;
		this.text = binaryData.toString('utf8', offset_add, offset_add + this.textLength);
	}

	override data_length(): number {
		return (Math.floor((4 + this.textLength + this.uuid.data_length + this.uuidIcon.data_length - 1) / 4) + 1) * 4;
	}

	override toPath(): string {
		const parentControl = this.state?.parentControl;
		const controlString = parentControl ? `${parentControl.name}/${parentControl.name}` : 'unknown';
		const roomString = parentControl?.room.name ?? 'unknown';
		return this.isEnriched ? `${roomString}/${controlString}/${this.state?.name}` : this.uuid.stringValue;
	}

	override toString(): string {
		return `${this.toPath()} = ${this.text}`;
	}
}

export default LoxTextEvent;
