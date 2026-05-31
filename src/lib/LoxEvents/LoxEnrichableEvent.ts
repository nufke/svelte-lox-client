import State from '../Structure/State';
import { LoxEvent } from './LoxEvent';

/**
 * Abstract base class for events that can be enriched with structure-file
 * metadata (room, control, and state names) after parsing.
 */
abstract class LoxEnrichableEvent extends LoxEvent {
	state: State | undefined;
	abstract toPath(): string;
	isEnriched: boolean | undefined;
}

export default LoxEnrichableEvent;
