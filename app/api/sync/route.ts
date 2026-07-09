import { NextRequest, NextResponse } from "next/server";
import { isUserId } from "@/lib/users";
import { hasValidGate } from "@/lib/user";
import { syncFromWaniKani } from "@/lib/wanikani-sync";

export const dynamic = "force-dynamic";

// POST { user, apiKey } — pull the given WaniKani account's progress and User
// Synonyms into `user`, rewriting that local user's state. Requires the shared
// password gate; the target user is taken from the body (the chooser screen
// triggers this before a user is selected).
export async function POST(req: NextRequest) {
  if (!(await hasValidGate())) {
    return NextResponse.json({ error: "Password required" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const user = body?.user;
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";

  if (!isUserId(user)) {
    return NextResponse.json({ error: "Unknown user" }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: "API key is required" }, { status: 400 });
  }

  try {
    const result = await syncFromWaniKani(apiKey, user);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
