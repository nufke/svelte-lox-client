import { LoxEvent } from '../LoxEvents/LoxEvent';
import UUID from '../WebSocketMessages/UUID';
import Control from './Control';

/**
 * Class that represents a single state output of a Miniserver control,
 * linking its UUID and name back to the parent control and optionally
 * caching the latest received event.
 */
class State {
	uuid: UUID;
	name: string;
	parentControl: Control;
	latestEvent: LoxEvent | undefined;

	/**
	 * Creates a State with the given UUID, name, and a reference
	 * to the control that owns it.
	 * @param uuid state UUID as type UUID
	 * @param uuid state name as sting
	 * @param parentControl control that owns the state
	 */
	constructor(uuid: UUID, name: string, parentControl: Control) {
		this.uuid = uuid;
		this.name = name;
		this.parentControl = parentControl;
	}
}

export default State;
