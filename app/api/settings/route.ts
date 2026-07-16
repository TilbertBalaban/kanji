import { NextRequest, NextResponse } from "next/server";
import { getLessonLimits, setLessonLimits } from "@/lib/progression";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

/** Current lesson-pacing settings: kanji and grammar lessons per day. */
export async function GET() {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const limits = await getLessonLimits(userId);
  return NextResponse.json(limits);
}

/** PUT { dailyLessonLimit?, grammarDailyLessonLimit? } — either or both, 1-200. */
export async function PUT(req: NextRequest) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const { dailyLessonLimit, grammarDailyLessonLimit } = body ?? {};
  if (
    (dailyLessonLimit !== undefined && typeof dailyLessonLimit !== "number") ||
    (grammarDailyLessonLimit !== undefined && typeof grammarDailyLessonLimit !== "number")
  ) {
    return NextResponse.json({ error: "Limits must be numbers" }, { status: 400 });
  }

  try {
    await setLessonLimits(userId, { dailyLessonLimit, grammarDailyLessonLimit });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save settings";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const limits = await getLessonLimits(userId);
  return NextResponse.json({ ok: true, ...limits });
}
