/** Parse a numeric route param; returns null unless it is a positive decimal integer. */
export function parseIntParam(value: string): number | null {
  // Strict digits only — Number() would also accept "0x10", "1e3" and " 5 ",
  // giving the same resource several distinct URLs.
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
