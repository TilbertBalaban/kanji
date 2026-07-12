import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUserInitialized } from "./progression";

// User identity comes from Clerk. Database rows are keyed by the Clerk user id
// (e.g. "user_2ab..."), so no local user table is needed.

// Initialization is one-time per user; remember who's done so steady-state
// requests skip the extra DB round trip (per serverless instance).
const initializedUsers = new Set<string>();

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
  if (!initializedUsers.has(userId)) {
    await ensureUserInitialized(userId);
    initializedUsers.add(userId);
  }
  return { userId };
}
