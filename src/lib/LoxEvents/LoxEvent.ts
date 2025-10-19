import UUID from '../WebSocketMessages/UUID';

abstract class LoxEvent {
	uuid: UUID;
	date: Date;
	abstract typeName: string;

	constructor(binaryData: Buffer, offset: number) {
		this.uuid = new UUID(binaryData, offset);
		this.date = new Date();
	}

	abstract data_length(): number;
	abstract toPath(): string;
}

type LoxEventCtor<T extends LoxEvent> = new (binaryData: Buffer, offset: number) => T;

export { LoxEvent, type LoxEventCtor };
