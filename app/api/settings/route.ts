import { NextRequest, NextResponse } from "next/server";
import { getPacingSettings, ProgressionError, setPacingSettings } from "@/lib/progression";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

/** Current pacing settings: lessons per day (kanji + grammar), batch ordering, review batch size. */
export async function GET() {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const settings = await getPacingSettings(userId);
  return NextResponse.json(settings);
}

/**
 * PUT { dailyLessonLimit?, grammarDailyLessonLimit?, reviewBatchSize?,
 * interleaveLessons? } — any subset; the counts are 1-200 and
 * interleaveLessons is a boolean.
 */
export async function PUT(req: NextRequest) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const { dailyLessonLimit, grammarDailyLessonLimit, reviewBatchSize, interleaveLessons } =
    body ?? {};
  const validLimit = (v: unknown) => v === undefined || (typeof v === "number" && Number.isInteger(v));
  if (
    !validLimit(dailyLessonLimit) ||
    !validLimit(grammarDailyLessonLimit) ||
    !validLimit(reviewBatchSize)
  ) {
    return NextResponse.json({ error: "Limits must be whole numbers" }, { status: 400 });
  }
  if (interleaveLessons !== undefined && typeof interleaveLessons !== "boolean") {
    return NextResponse.json(
      { error: "interleaveLessons must be a boolean" },
      { status: 400 },
    );
  }

  try {
    await setPacingSettings(userId, {
      dailyLessonLimit,
      grammarDailyLessonLimit,
      reviewBatchSize,
      interleaveLessons,
    });
  } catch (e) {
    // Validation problems are the user's 400; anything else is a real 500.
    if (e instanceof ProgressionError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const settings = await getPacingSettings(userId);
  return NextResponse.json({ ok: true, ...settings });
}
