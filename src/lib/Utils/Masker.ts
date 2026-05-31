/**
 * Function that replaces the values of the listed JSON property names
 * with `***masked***` in the serialised string.
 * @param input input string which is masked
 * @param maskedProperties array of properties to be masked
 * @return masked string
 */
export function maskProperties(input: string, maskedProperties: string[]): string {
	for (const maskedProperty of maskedProperties) {
		const pattern = new RegExp(`("${maskedProperty}":")([^"]+)(")`, 'g');
		input = input.replace(pattern, '$1***masked***$3');
	}
	return input;
}

/**
 * Truncates the cipher payload of a `jdev/sys/enc/…` command so secrets
 * are not logged in full.
 * @param input input string which is truncated
 * @return truncated string
 */
export function maskEnc(input: string | undefined): string | undefined {
	if (!input) {
		return input;
	}
	const pattern = new RegExp(`(jdev/sys/enc/)(.{8})(.*)`, 'g');
	input = input.replace(pattern, '$1$2...');
	return input;
}
