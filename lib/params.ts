/** Parse a numeric route param; returns null unless it is a positive integer. */
export function parseIntParam(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
