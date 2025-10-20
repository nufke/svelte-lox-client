import { LoxEvent } from '../LoxEvents/LoxEvent';
import UUID from '../WebSocketMessages/UUID';
import Control from './Control';

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
