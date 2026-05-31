/**
 * Class that wraps a raw WebSocket file payload as a typed message, 
 * classifying it as `json`, `text`, or `binary` based on the filename
 * extension and the binary flag.
 */
class FileMessage {
	filename: string;
	type: 'json' | 'text' | 'binary';
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	data: any;
	length: number;

	/**
	 * Wraps a raw WebSocket payload as a typed file message;
	 * parses JSON if the filename ends with `.json`, otherwise
	 * stores binary or plain text.
	 * @param payload WebSocket payload
	 * @param isBinary true for binary payload, otherwise false
	 * @param filename name of the file
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	constructor(payload: any, isBinary: boolean, filename: string) {
		this.filename = filename;

		if (!isBinary) {
			this.length = payload.toString().length;
			if (filename.match(/\.json$/)) {
				this.type = 'json';
				this.data = JSON.parse(payload.toString());
			} else {
				this.type = 'text';
				this.data = payload.toString();
			}
		} else {
			this.type = 'binary';
			this.data = payload as Buffer;
			this.length = Buffer.byteLength(this.data);
		}
	}

	/**
	 * Returns a concise summary of the file message including file meta-data (filename,
	 * content type, and byte length).
	 * @returns meta-data of the filename
	 */
	toString(): string {
		return `filename: ${this.filename}, type: ${this.type}, length: ${this.length} bytes`;
	}
}

export default FileMessage;
