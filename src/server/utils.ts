/**
 * Generates a timestamp in ISO 8601 format.
 * @returns The current timestamp as a string.
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Checks if a value is a plain object (excluding arrays and null).
 * @param value The value to check.
 * @returns True if the value is a plain object, false otherwise.
 */
export function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
