import LoxEnrichableEvent from './LoxEnrichableEvent';

/**
 * Class Representing the Loxone numeric-state event received as ETABLE_VALUES binary;
 * Holds a 64-bit double value.
 */
class LoxValueEvent extends LoxEnrichableEvent {
	typeName = LoxValueEvent.name;
	value: number;

	/**
	 * Parses a value event , reading a 64-bit little-endian double as the state value.
	 * @param binaryData data of type Buffer
	 * @param offset offset
	 */
	constructor(binaryData: Buffer, offset: number) {
		super(binaryData, offset);
		this.value = binaryData.readDoubleLE(offset + this.uuid.data_length);
	}

	/**
	 * Returns the total byte length of this event (UUID + 8-byte double = 24 bytes).
	 * @returns total byte length
	 */
	override data_length(): number {
		return 8 + this.uuid.data_length; // should always be 24
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
	 * Returns `path = value` as a loggable string.
	 * @returns state path and vaue
	 */
	override toString(): string {
		return `${this.toPath()} = ${this.value}`;
	}
}

export default LoxValueEvent;
