import LoxEnrichableEvent from './LoxEnrichableEvent';

class LoxValueEvent extends LoxEnrichableEvent {
	typeName = LoxValueEvent.name;
	value: number;

	constructor(binaryData: Buffer, offset: number) {
		super(binaryData, offset);
		this.value = binaryData.readDoubleLE(offset + this.uuid.data_length);
	}

	override data_length(): number {
		return 8 + this.uuid.data_length; // should always be 24
	}

	override toPath(): string {
		const parentControl = this.state?.parentControl;
		const controlString = parentControl ? `${parentControl.name}/${parentControl.name}` : 'unknown';
		const roomString = parentControl?.room.name ?? 'unknown';
		return this.isEnriched ? `${roomString}/${controlString}/${this.state?.name}` : this.uuid.stringValue;
	}

	override toString(): string {
		return `${this.toPath()} = ${this.value}`;
	}
}

export default LoxValueEvent;
