import { NextRequest, NextResponse } from "next/server";
import { getLessonSettings, setLessonSettings } from "@/lib/progression";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

/** Current lesson settings: lessons per day (kanji + grammar) and batch ordering. */
export async function GET() {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const settings = await getLessonSettings(userId);
  return NextResponse.json(settings);
}

/**
 * PUT { dailyLessonLimit?, grammarDailyLessonLimit?, interleaveLessons? } —
 * any subset; the caps are 1-200 and interleaveLessons is a boolean.
 */
export async function PUT(req: NextRequest) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const { dailyLessonLimit, grammarDailyLessonLimit, interleaveLessons } = body ?? {};
  if (
    (dailyLessonLimit !== undefined && typeof dailyLessonLimit !== "number") ||
    (grammarDailyLessonLimit !== undefined && typeof grammarDailyLessonLimit !== "number")
  ) {
    return NextResponse.json({ error: "Limits must be numbers" }, { status: 400 });
  }
  if (interleaveLessons !== undefined && typeof interleaveLessons !== "boolean") {
    return NextResponse.json(
      { error: "interleaveLessons must be a boolean" },
      { status: 400 },
    );
  }

  try {
    await setLessonSettings(userId, {
      dailyLessonLimit,
      grammarDailyLessonLimit,
      interleaveLessons,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save settings";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const settings = await getLessonSettings(userId);
  return NextResponse.json({ ok: true, ...settings });
}
