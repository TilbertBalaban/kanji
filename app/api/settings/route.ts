import { NextRequest, NextResponse } from "next/server";
import { getLessonSettings, ProgressionError, setLessonSettings } from "@/lib/progression";
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
  const validLimit = (v: unknown) => v === undefined || (typeof v === "number" && Number.isInteger(v));
  if (!validLimit(dailyLessonLimit) || !validLimit(grammarDailyLessonLimit)) {
    return NextResponse.json({ error: "Limits must be whole numbers" }, { status: 400 });
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
    // Validation problems are the user's 400; anything else is a real 500.
    if (e instanceof ProgressionError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const settings = await getLessonSettings(userId);
  return NextResponse.json({ ok: true, ...settings });
}
