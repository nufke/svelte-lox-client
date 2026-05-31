import { maskEnc, maskProperties } from '../Utils/Masker';

const MASKED_PROPERTIES: string[] = ['token', 'key', 'salt'];

/**
 * Class that parses a raw UTF-8 WebSocket payload into a typed message with
 * json, control, or text classification, exposing optional control path,
 * value, and HTTP-style status code.
 */
class TextMessage {
	private json;
	type: 'json' | 'control' | 'text';
	data: string | undefined;
	control: string | undefined;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	value: any;
	code: number | undefined;

	/**
	 * Parses a raw UTF-8 WebSocket text payload into a typed message with
	 * optional control, value, and status code fields.
	 * @param utf8Data text payload given as string
	 */
	constructor(utf8Data: string) {
		try {
			this.json = JSON.parse(utf8Data);
			this.type = 'json';
			this.data = this.json;
			if (this.json.LL) {
				if (this.json.LL.code || this.json.LL.Code) {
					this.code = parseInt(this.json.LL.Code ?? this.json.LL.code);
				}
				if (this.json.LL.control) {
					this.type = 'control';
					this.control = this.json.LL.control;
					this.value = this.json.LL.value;
				}
			}
		} catch {
			this.type = 'text';
			this.data = utf8Data;
		}
	}

	/**
	 * Returns a loggable, masked string representation of the message,
	 * hiding sensitive fields such as token and key.
	 * @return masked string of text message 
	 */
	toString(): string {
		switch (this.type) {
			case 'text':
				return `${this.data ?? ''}`;
			case 'json': {
				const jsonText = JSON.stringify(this.data ?? {});
				return maskProperties(jsonText, MASKED_PROPERTIES);
			}
			case 'control': {
				const jsonText = JSON.stringify(this.value);
				return `${maskEnc(this.control)} = ${maskProperties(jsonText, MASKED_PROPERTIES)}`;
			}
		}
	}
}

export default TextMessage;
