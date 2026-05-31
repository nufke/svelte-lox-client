import UUID from '../WebSocketMessages/UUID';

/**
 * Class that represents a room from the Miniserver structure file,
 * identified by UUID and display name.
 */
class Room {
	uuid: UUID;
	name: string;

	/**
	 * Creates a Room with the given UUID and display name.
	 * @param uuid room UUID as type UUID
	 * @param uuid room name as sting
	 */
	constructor(uuid: UUID, name: string) {
		this.uuid = uuid;
		this.name = name;
	}
}

export default Room;
