import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isUserId, GATE_COOKIE, SESSION_COOKIE, type UserId } from "./users";
import { unsign, GATE_PAYLOAD } from "./auth";

/** True if the shared password has been verified (valid gate cookie present). */
export async function hasValidGate(): Promise<boolean> {
  const store = await cookies();
  return unsign(store.get(GATE_COOKIE)?.value) === GATE_PAYLOAD;
}

/** The current user from the signed session cookie, or null if none/invalid. */
export async function getCurrentUserId(): Promise<UserId | null> {
  const store = await cookies();
  const user = unsign(store.get(SESSION_COOKIE)?.value);
  return isUserId(user) ? user : null;
}

/**
 * Resolve the current user for an API route. On success returns { userId };
 * otherwise returns { response } with a 401 the route should return directly.
 */
export async function requireUserId(): Promise<
  { userId: UserId; response?: undefined } | { userId?: undefined; response: NextResponse }
> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      response: NextResponse.json({ error: "No user selected" }, { status: 401 }),
    };
  }
  return { userId };
}
