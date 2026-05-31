import { createHash, createHmac } from 'crypto';

/**
 * Function that returns a hex-encoded hash of the payload using
 * the given hasing algorithm.
 * @param data data to be hashed
 * @param algorithm (optional) hashing algorithm (default: sha256) 
 */
export function hash(data: string, algorithm = 'sha256'): string {
	const hasher = createHash(algorithm);
	hasher.update(data);
	return hasher.digest('hex');
}

/**
 * Function that returns a hex-encoded HMAC of the given data,
 * keyed with a key using the given algorithm.
 * @param data data to be hashed
 * @param key key used for the creation of the HMAC
 * @param algorithm (optional) hashing algorithm (default: sha256)
 * @returns hex-encoded HMAC
 */
export function hmacHash(data: string, key: Buffer, algorithm = 'sha256'): string {
	const hasher = createHmac(algorithm, key);
	hasher.update(data);
	return hasher.digest('hex');
}
