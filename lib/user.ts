import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUserInitialized } from "./progression";

// User identity comes from Clerk. Database rows are keyed by the Clerk user id
// (e.g. "user_2ab..."), so no local user table is needed.

/** The current Clerk user id, or null if not signed in. */
export async function getCurrentUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

/**
 * Resolve the current user for an API route. On success returns { userId }
 * (with the user's progress rows initialized on first use); otherwise returns
 * { response } with a 401 the route should return directly.
 */
export async function requireUserId(): Promise<
  { userId: string; response?: undefined } | { userId?: undefined; response: NextResponse }
> {
  const { userId } = await auth();
  if (!userId) {
    return {
      response: NextResponse.json({ error: "Not signed in" }, { status: 401 }),
    };
  }
  await ensureUserInitialized(userId);
  return { userId };
}
