import Room from './Room';
import State from './State';

/**
 * Class that represents a Miniserver control (switch, dimmer, jalousie, etc.) 
 * parsed from the structure file, with indexed lookups for its states by name and UUID.
 */
class Control {
	uuid: string;
	name: string;
	room: Room;
	parent: Control | undefined;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	structureSection: any;
	type: string;
	uuidAction: string;
	states: Set<State> = new Set<State>();
	statesByName: Map<string, State> = new Map<string, State>();
	statesByUuid: Map<string, State> = new Map<string, State>();

	/**
	 * Creates a Control from the given UUID, raw structure-file section,
	 * containing room, and optional parent control.
	 * @param uuid control UUID as type UUID
	 * @param structureSection part of structure of the control
	 * @param room room for the control
	 * @param parent (optional) parent of the room
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	constructor(uuid: string, structureSection: any, room: Room, parent: Control | undefined = undefined) {
		this.uuid = uuid;
		this.structureSection = structureSection;
		this.name = structureSection.name;
		this.type = structureSection.type;
		this.uuidAction = structureSection.uuidAction;
		this.parent = parent;
		this.room = room;
	}

	/**
	 * Registers state in all three state lookup collections (set, by-name map, by-UUID map).
	 * @param state control state
	 */
	addState(state: State): void {
		this.states.add(state);
		this.statesByName.set(state.name, state);
		this.statesByUuid.set(state.uuid.stringValue, state);
	}
}

export default Control;
