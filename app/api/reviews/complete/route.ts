import { NextRequest, NextResponse } from "next/server";
import { completeReview } from "@/lib/progression";
import { requireUserId } from "@/lib/user";

export async function POST(req: NextRequest) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const body = await req.json();
  const {
    subjectId,
    meaningIncorrectCount = 0,
    readingIncorrectCount = 0,
    recallIncorrectCount = 0,
  } = body;
  if (typeof subjectId !== "number") {
    return NextResponse.json({ error: "subjectId required" }, { status: 400 });
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
    return NextResponse.json({ error: String(e) }, { status: 422 });
  }
}
