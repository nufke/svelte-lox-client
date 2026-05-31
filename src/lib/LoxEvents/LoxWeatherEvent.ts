import UUID from '../WebSocketMessages/UUID';
import LoxEnrichableEvent from './LoxEnrichableEvent';

/**
 * Class representing the Loxone weather event received as ETABLE_WEATHER binary;
 * holds a last-update timestamp and a list of hourly forecast entries.
 */
class LoxWeatherEvent extends LoxEnrichableEvent {
	typeName = LoxWeatherEvent.name;
	lastUpdate: number;
	entries: number;
	entry: {
		timestamp: number;
		weatherType: number;
		windDirection: number;
		solarRadiation: number;
		relativeHumidity: number;
		temperature: number;
		perceivedTemperature: number;
		dewPoint: number;
		precipitation: number;
		windSpeed: number;
		barometricPressure: number;
	}[];

	/**
	 * Parses a weather event, reading the last-update timestamp and all forecast entries.
	 * @param binaryData data of type Buffer
	 * @param offset offset
	 */
	constructor(binaryData: Buffer, offset: number) {
		super(binaryData, offset);
		let offset_add = offset;
		this.uuid = new UUID(binaryData, offset_add);
		offset_add += this.uuid.data_length;
		this.lastUpdate = binaryData.readUInt32LE(offset_add);
		offset_add += 4;
		this.entries = binaryData.readInt32LE(offset_add);
		offset_add += 4;

		this.entry = [];

		for (let i = 0; i < this.entries; i++) {
			this.entry.push({
				timestamp: binaryData.readInt32LE(offset_add),
				weatherType: binaryData.readInt32LE(offset_add + 4),
				windDirection: binaryData.readInt32LE(offset_add + 8),
				solarRadiation: binaryData.readInt32LE(offset_add + 12),
				relativeHumidity: binaryData.readInt32LE(offset_add + 16),
				temperature: binaryData.readDoubleLE(offset_add + 20),
				perceivedTemperature: binaryData.readDoubleLE(offset_add + 28),
				dewPoint: binaryData.readDoubleLE(offset_add + 36),
				precipitation: binaryData.readDoubleLE(offset_add + 44),
				windSpeed: binaryData.readDoubleLE(offset_add + 52),
				barometricPressure: binaryData.readDoubleLE(offset_add + 60)
			});
			offset_add += 68;
		}
	}

	/**
	 * Returns the total byte length of this event: 
	 * UUID + 4-byte lastUpdate + 4-byte entry count + 68 bytes per entry.
	 * @returns total byte length 
	 */
	override data_length(): number {
		return this.uuid.data_length + 4 + 4 + this.entries * 68;
	}

	/**
	 * Returns the UUID string as the event path (weather events are not
	 * enriched with room/control names).
	 * @returns event UUID as string
	 */
	override toPath(): string {
		return this.uuid.stringValue;
	}

	/**
	 * Returns a multi-line string listing the last-update timestamp and
	 * all forecast entries with their weather fields.
	 * @returns weather forecast as string
	 */
	override toString(): string {
		let str = '{lastUpdate: ' + this.lastUpdate + ', entries: ' + this.entries + ', entry: [\n';
		for (let i = 0; i < this.entries; i++) {
			const entry = this.entry[i];
			str += '{timestamp: ' + entry.timestamp;
			str += ', weatherType: ' + entry.weatherType;
			str += ', windDirection: ' + entry.windDirection;
			str += ', solarRadiation: ' + entry.solarRadiation;
			str += ', relativeHumidity: ' + entry.relativeHumidity;
			str += ', temperature: ' + entry.temperature;
			str += ', perceivedTemperature: ' + entry.perceivedTemperature;
			str += ', dewPoint: ' + entry.dewPoint;
			str += ', precipitation: ' + entry.precipitation;
			str += ', windSpeed: ' + entry.windSpeed;
			str += ', barometricPressure: ' + entry.barometricPressure;
			str += '}\n';
		}
		str += '], uuid: ' + this.uuid.stringValue + '}';
		return str;
	}
}

export default LoxWeatherEvent;
