import { maskEnc, maskProperties } from '../Utils/Masker';

class TextMessage {
	private json;
	type: 'json' | 'control' | 'text';
	data: string | undefined;
	control: string | undefined;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	value: any;
	code: number | undefined;

	constructor(utf8Data: string) {
		try {
			this.json = JSON.parse(utf8Data);
			this.type = 'json';
			this.data = this.json;
			if (this.json.LL) {
				if (this.json.LL.code || this.json.LL.Code)
					this.code = parseInt(this.json.LL.Code ?? this.json.LL.code);

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

	toString(): string {
		switch (this.type) {
			case 'text':
				return `${this.data ?? ''}`;
			case 'json': {
				const jsonText = JSON.stringify(this.data ?? {});
				return maskProperties(jsonText, ['token', 'key', 'salt']);
			}
			case 'control': {
				const jsonText = JSON.stringify(this.value);
				return `${maskEnc(this.control)} = ${maskProperties(jsonText, ['token', 'key', 'salt'])}`;
			}
		}
	}
}

export default TextMessage;
