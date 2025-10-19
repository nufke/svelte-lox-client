import State from '../Structure/State';
import { LoxEvent } from './LoxEvent';

abstract class LoxEnrichableEvent extends LoxEvent {
	state: State | undefined;
	abstract toPath(): string;
	isEnriched: boolean | undefined;
}

export default LoxEnrichableEvent;
