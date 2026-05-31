import UUID from '../WebSocketMessages/UUID';

/**
 * Abstract base class for all Loxone event types received as binary
 * event-table message. Holds the event UUID and timestamp.
 */
abstract class LoxEvent {
	uuid: UUID;
	date: Date;
	abstract typeName: string;

	/**
	 * Parses the 128-bit UUID from `binaryData` at `offset` 
	 * and records the current timestamp.
	 * @param binaryData data of type Buffer
	 * @param offset offset
	 */
	constructor(binaryData: Buffer, offset: number) {
		this.uuid = new UUID(binaryData, offset);
		this.date = new Date();
	}

	/**
	 * Returns the total byte length of this event entry in the 
	 * binary event table.
	 */
	abstract data_length(): number;

	/**
	 * Returns a human-readable path identifying this event
	 * (enriched room/control/state or raw UUID).
	 */
	abstract toPath(): string;
}

type LoxEventCtor<T extends LoxEvent> = new (binaryData: Buffer, offset: number) => T;

export { LoxEvent, type LoxEventCtor };
