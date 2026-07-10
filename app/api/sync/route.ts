import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/user";
import { getStoredApiKey } from "@/lib/wanikani-key";
import { syncFromWaniKani } from "@/lib/wanikani-sync";

export const dynamic = "force-dynamic";

// POST — pull the signed-in user's WaniKani progress and User Synonyms into
// their local state, using the API token saved on their profile.
export async function POST() {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const apiKey = await getStoredApiKey(userId);
  if (!apiKey) {
    return NextResponse.json(
      { error: "No WaniKani API token saved — add one on your profile first" },
      { status: 400 },
    );
  }

  try {
    const result = await syncFromWaniKani(apiKey, userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
