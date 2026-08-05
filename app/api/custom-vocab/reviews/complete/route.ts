import { NextRequest, NextResponse } from "next/server";
import { completeCustomVocabReview, ProgressionError } from "@/lib/progression";
import { requireUserId } from "@/lib/user";

export async function POST(req: NextRequest) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const {
    id,
    meaningIncorrectCount = 0,
    readingIncorrectCount = 0,
    recallIncorrectCount = 0,
  } = body;
  if (typeof id !== "number" || !Number.isInteger(id)) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  // Same guard as /api/reviews/complete: out-of-range counts would corrupt
  // the SRS stage math.
  const counts = [meaningIncorrectCount, readingIncorrectCount, recallIncorrectCount];
  if (!counts.every((n) => Number.isInteger(n) && n >= 0 && n <= 100)) {
    return NextResponse.json(
      { error: "incorrect counts must be integers between 0 and 100" },
      { status: 400 },
    );
  }
  try {
    const result = await completeCustomVocabReview(
      userId,
      id,
      meaningIncorrectCount,
      readingIncorrectCount,
      recallIncorrectCount,
    );
    return NextResponse.json(result);
  } catch (e) {
    // 422 only for expected business rejections; anything else is a real 500.
    if (e instanceof ProgressionError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    throw e;
  }
}
