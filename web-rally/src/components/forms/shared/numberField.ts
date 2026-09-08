/**
 * Helpers for numeric form inputs.
 *
 * Controlled number inputs that render a literal `0` leave that zero in the
 * field, so typing appends to it and the staff sees "05" instead of "5".
 * Rendering an empty string instead (with a "0" placeholder) keeps the field
 * clean while the parsed value stays numeric.
 */

/** Value to render in a number input: empty while the value is the neutral default. */
export function displayCount(value: number | undefined, neutral = 0): number | string {
  return value === undefined || value === neutral ? "" : value;
}

/** Parse a number input value, falling back when empty or invalid. */
export function parseCount(raw: string, fallback = 0): number {
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
