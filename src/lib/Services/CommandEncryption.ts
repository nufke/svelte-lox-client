import { createCipheriv, randomBytes } from 'crypto';
import Auth from './Auth';

/**
 * Class that provides AES-256-CBC command encryption for Gen1 Miniservers,
 * managing the salt rotation policy and wrapping plaintext commands.
 */
class CommandEncryption {
	auth: Auth;
	private current_salt: string;
	private saltBytes = 16;
	private saltUsageCount: number;
	private maxSaltTime: number;
	private nextSaltTime: number;
	private maxSaltUsage: number;
	key: Buffer;
	iv: Buffer;

	/**
	 * Initialises the encryption context for the given auth service and
	 * generates a fresh AES-256-CBC key, IV, and salt.
	 */
	constructor(auth: Auth) {
		this.auth = auth;
		this.saltBytes = 16;
		this.current_salt = this.generate_salt();
		this.saltUsageCount = 0;
		this.maxSaltUsage = 20;
		this.maxSaltTime = 30 * 1000;
		this.nextSaltTime = new Date().getTime() + this.maxSaltTime;
		this.iv = randomBytes(16);
		this.key = randomBytes(32);
	}

	/**
	 * Wraps a command with a salt prefix, AES-256-CBC encrypts the result.
	 * Rotates to a new salt when the usage count or time limit is exceeded.
	 * @param command command to be encrypted
	 * @returns encrypted command containing prefix `jdev/sys/enc/..` followed by the URL-encoded command string.
	 */
	getEncryptedCommand(command: string): string {
		let salt_part = `salt/${this.current_salt}`;
		if (this.isNewSaltNeeded()) {
			const oldSalt = this.current_salt;
			this.current_salt = this.generate_salt();
			salt_part = `nextSalt/${oldSalt}/${this.current_salt}`;
		}
		const enc_part = this.cipher(`${salt_part}/${command}`, 'base64');

		return `jdev/sys/enc/${encodeURIComponent(enc_part)}`;
	}

	/**
	 * Returns true and resets counters when the current salt has
	 * reach ed its maximum usage, or if the time window has expired.
	 */
	private isNewSaltNeeded(): boolean {
		if (this.saltUsageCount <= 0) {
			this.nextSaltTime = new Date().getTime() + this.maxSaltTime;
		}
		this.saltUsageCount++;
		if (this.saltUsageCount >= this.maxSaltUsage || this.nextSaltTime < new Date().getTime()) {
			this.saltUsageCount = 0;
			return true;
		}
		return false;
	}

	/**
	 * Encrypts the given data with AES-256-CBC using the current key and IV,
	 * appending a null terminator, and returns the result in the specified output encoding.
	 * @param data input data that needs to be encrypted
	 * @param outputEncoding specifies the output format of the enciphered data
	 * @returns Encrypted data as string
	 */
	private cipher(data: string, outputEncoding : 'base64'): string {
		const cipher = createCipheriv('aes-256-cbc', this.key, this.iv);
		let encryptedData = cipher.update(data + '\0', 'utf-8', outputEncoding );
		encryptedData += cipher.final(outputEncoding );
		return encryptedData;
	}

	/**
	 * Generates a URL-encoded random hex salt with a length specified by member saltBytes.
	 * @returns random hex string
	 */
	private generate_salt(): string {
		return encodeURIComponent(randomBytes(this.saltBytes).toString('hex'));
	}
}

export default CommandEncryption;
