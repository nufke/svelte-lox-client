import UUID from '../WebSocketMessages/UUID';
import LoxEnrichableEvent from './LoxEnrichableEvent';

/**
 * Class representing the Loxone text-state event received as ETABLE_TEXT binary;
 * holds the icon UUID and the UTF-8 text value.
 */
class LoxTextEvent extends LoxEnrichableEvent {
	typeName = LoxTextEvent.name;
	uuidIcon: UUID;
	textLength: number;
	text: string;

	/**
	 * Parses a text event, reading the icon UUID, text length,
	 * and UTF-8 text payload.
	 * @param binaryData data of type Buffer
	 * @param offset offset
	 */
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

	/**
	 * Returns the total byte length of this event, padded to a 4-byte boundary.
	 * @returns total byte length
	 */
	override data_length(): number {
		return (Math.floor((4 + this.textLength + this.uuid.data_length + this.uuidIcon.data_length - 1) / 4) + 1) * 4;
	}

	/**
	 * Returns the human-readable path room/control/state when enriched,
	 * or the raw UUID string otherwise.
	 * @returns event UUID or full path of state name when enriched
	 */
	override toPath(): string {
		const parentControl = this.state?.parentControl;
		const controlString = parentControl ? `${parentControl.name}/${parentControl.name}` : 'unknown';
		const roomString = parentControl?.room.name ?? 'unknown';
		return this.isEnriched ? `${roomString}/${controlString}/${this.state?.name}` : this.uuid.stringValue;
	}

	/**
	 * Returns `path = text` as a loggable string.
	 * @returns state path and vaue
	 */
	override toString(): string {
		return `${this.toPath()} = ${this.text}`;
	}
}

export default LoxTextEvent;
