import crypto from "node:crypto";

// Server-only auth helpers. The shared password and signing secret come from
// env vars so the password is never shipped in the client bundle, and the
// session/gate cookies are HMAC-signed so they can't be forged.

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function hmac(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

/** Produce a tamper-proof cookie value: `<payload>.<hmac>`. */
export function sign(payload: string): string {
  return `${payload}.${hmac(payload)}`;
}

/** Return the original payload if the signature is valid, else null. */
export function unsign(token: string | undefined | null): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = hmac(payload);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return payload;
}

/** Constant-time check of a submitted password against APP_PASSWORD. */
export function checkPassword(input: unknown): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected || typeof input !== "string") return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Marker payload stored (signed) in the gate cookie once the password is verified.
export const GATE_PAYLOAD = "granted";
