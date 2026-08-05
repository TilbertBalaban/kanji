import { NextRequest, NextResponse } from "next/server";
import { completeReview, ProgressionError } from "@/lib/progression";
import { requireUserId } from "@/lib/user";

export async function POST(req: NextRequest) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const {
    subjectId,
    meaningIncorrectCount = 0,
    readingIncorrectCount = 0,
    recallIncorrectCount = 0,
  } = body;
  if (typeof subjectId !== "number" || !Number.isInteger(subjectId)) {
    return NextResponse.json({ error: "subjectId required" }, { status: 400 });
  }
  // A wrong-count outside a sane range (negative, fractional, huge) would
  // corrupt the SRS stage math and the accuracy stats.
  const counts = [meaningIncorrectCount, readingIncorrectCount, recallIncorrectCount];
  if (!counts.every((n) => Number.isInteger(n) && n >= 0 && n <= 100)) {
    return NextResponse.json(
      { error: "incorrect counts must be integers between 0 and 100" },
      { status: 400 },
    );
  }
  try {
    const result = await completeReview(
      userId,
      subjectId,
      meaningIncorrectCount,
      readingIncorrectCount,
      recallIncorrectCount,
    );
    return NextResponse.json(result);
  } catch (e) {
    // Only expected business rejections become a 422; an infrastructure
    // failure (DB timeout etc.) must surface as a 500 so the client retries
    // instead of treating the review as permanently rejected.
    if (e instanceof ProgressionError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    throw e;
  }
}
