import MessageType from './MessageType';
import WsBinHdr from './WsBinHdr';

/**
 * Class that extends class WsBinHdr by resolving the identifier
 * byte to a `MessageType` enum value and exposing the estimated-header
 * flag and the next expected message type.
 */
class ParsedHeader extends WsBinHdr {
	messageType: MessageType;
	isEstimated: boolean;

	/**
	 * Constructs a ParsedHeader and resolves the identifier to a MessageType;
	 * throws an error if the identifier is unknown.
	 * @param cBinType (optional) start of header
	 * @param cIdentifier (optional) 8-Bit Unsigned Integer (little endian)
	 * @param cInfo info
	 * @param cReserved reserved
	 * @param nLen 32-Bit Unsigned Integer (little endian)
	 */
	constructor(cBinType = 0x03, cIdentifier = 0, cInfo = 0, cReserved = 0, nLen = 0) {
		super(cBinType, cIdentifier, cInfo, cReserved, nLen);

		// parse message type
		const candidate = this.cIdentifier as unknown as MessageType;
		if (typeof MessageType[candidate] === 'undefined') {
			throw new Error(`Unknown header identifier: ${this.cIdentifier}`);
		}
		this.messageType = candidate;

		this.isEstimated = (cInfo & 0x80) !== 0;
	}

	/**
	 * Returns the MessageType that the client should expect to receive after this header.
	 */
	getNextExpectedMessageType(): MessageType {
		if (this.isEstimated) {
			// estimated header is always followed by the real header
			return MessageType.HEADER;
		}

		switch (this.messageType) {
			case MessageType.TEXT:
				return MessageType.TEXT;
			case MessageType.BINARY_FILE:
				return MessageType.BINARY_FILE;
			case MessageType.ETABLE_VALUES:
				return MessageType.ETABLE_VALUES;
			case MessageType.ETABLE_TEXT:
				return MessageType.ETABLE_TEXT;
			case MessageType.ETABLE_DAYTIMER:
				return MessageType.ETABLE_DAYTIMER;
			case MessageType.OUT_OF_SERVICE:
				return MessageType.HEADER;
			case MessageType.KEEPALIVE:
				return MessageType.HEADER;
			case MessageType.ETABLE_WEATHER:
				return MessageType.ETABLE_WEATHER;
			default:
				throw new Error(`Unknown header identifier: ${this.cIdentifier}`);
		}
	}

	/**
	 * Parse a WsBinHdr from a Buffer at the given offset (default 0).
	 */
	static fromBuffer(buf: Buffer, offset = 0): ParsedHeader {
		if (buf.length < offset + WsBinHdr.SIZE) {
			throw new RangeError('Buffer too small to read WsBinHdr');
		}
		const cBinType = buf.readUInt8(offset + 0);
		const cIdentifier = buf.readUInt8(offset + 1);
		const cInfo = buf.readUInt8(offset + 2);
		const cReserved = buf.readUInt8(offset + 3);
		const nLen = buf.readUInt32LE(offset + 4);
		return new ParsedHeader(cBinType, cIdentifier, cInfo, cReserved, nLen);
	}

	/**
	 * Create a WsBinHdr from a WebSocket raw message and isBinary flag.
	 * Accepts Buffer, ArrayBuffer, Buffer[] or ArrayBufferView (Uint8Array).
	 */
	static fromWsMessage(data: ArrayBuffer, isBinary: boolean): ParsedHeader {
		if (!isBinary) {
			throw new TypeError('Expected binary data for ParsedHeader');
		}

		const buffer = Buffer.from(data); /* Conver ArrayBuffer to buffer of type Buffer */
		if (!Buffer.isBuffer(buffer)) {
			throw new TypeError('Expected buffer for ParsedHeader');
		}

		return ParsedHeader.fromBuffer(buffer, 0);
	}
}

export default ParsedHeader;
