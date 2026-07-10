import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/user";
import {
  getStoredApiKey,
  maskApiKey,
  setStoredApiKey,
  validateApiKey,
} from "@/lib/wanikani-key";

export const dynamic = "force-dynamic";

/** Current profile state: a masked hint of the stored WaniKani key, if any. */
export async function GET() {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const key = await getStoredApiKey(userId);
  return NextResponse.json({ keyHint: key ? maskApiKey(key) : null });
}

/**
 * PUT { apiKey } — validate against WaniKani and store the token in Clerk
 * private metadata. An empty apiKey clears the stored token.
 */
export async function PUT(req: NextRequest) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const body = await req.json().catch(() => null);
  if (typeof body?.apiKey !== "string") {
    return NextResponse.json({ error: "apiKey must be a string" }, { status: 400 });
  }
  const apiKey = body.apiKey.trim();

  if (!apiKey) {
    await setStoredApiKey(userId, null);
    return NextResponse.json({ ok: true, keyHint: null });
  }

  try {
    const username = await validateApiKey(apiKey);
    await setStoredApiKey(userId, apiKey);
    return NextResponse.json({ ok: true, keyHint: maskApiKey(apiKey), username });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not verify API token";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
