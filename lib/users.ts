// The fixed roster of users. No registration — see AuthGate for the UI.
// This module must stay free of server-only imports (next/headers, prisma)
// so it can be imported by client components and standalone scripts alike.

export const USER_IDS = ["Tilbert", "Kate"] as const;

export type UserId = (typeof USER_IDS)[number];

// Signed httpOnly cookies set by the server (see lib/auth.ts):
//   GATE_COOKIE    — proof the shared password was entered correctly
//   SESSION_COOKIE — which user is currently selected
export const GATE_COOKIE = "kanilocal.gate";
export const SESSION_COOKIE = "kanilocal.session";

export function isUserId(value: unknown): value is UserId {
  return typeof value === "string" && (USER_IDS as readonly string[]).includes(value);
}
