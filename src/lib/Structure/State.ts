import { LoxEvent } from '../LoxEvents/LoxEvent.js';
import UUID from '../WebSocketMessages/UUID.js';
import Control from './Control.js';

class State {
	uuid: UUID;
	name: string;
	parentControl: Control;
	latestEvent: LoxEvent | undefined;

	constructor(uuid: UUID, name: string, parentControl: Control) {
		this.uuid = uuid;
		this.name = name;
		this.parentControl = parentControl;
	}
}

export default State;
