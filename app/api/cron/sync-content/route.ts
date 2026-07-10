import { NextRequest, NextResponse } from "next/server";
import { syncContentFromWaniKani } from "@/lib/content-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// WaniKani ships weekly content updates; the cron runs weekly the day after.
// A 30-day lookback keeps the run idempotent and covers a few missed runs
// without needing to persist a last-synced timestamp.
const LOOKBACK_DAYS = 30;

// GET — triggered by Vercel Cron (see vercel.json). Vercel sends
// `Authorization: Bearer ${CRON_SECRET}`; the same header lets you trigger a
// run manually with curl.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.WANIKANI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "WANIKANI_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const updatedAfter = new Date(
    Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );

  try {
    const result = await syncContentFromWaniKani(apiKey, updatedAfter);
    return NextResponse.json({
      ok: true,
      updatedAfter: updatedAfter.toISOString(),
      upserted: result.upserted,
      skippedHidden: result.skippedHidden,
      subjects: result.updatedSubjects,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Content sync failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
