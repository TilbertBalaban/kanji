import { NextRequest, NextResponse } from "next/server";
import { completeGrammarReview } from "@/lib/progression";
import { requireUserId } from "@/lib/user";

export async function POST(req: NextRequest) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const { grammarPointId, incorrectCount = 0 } = body;
  if (typeof grammarPointId !== "number" || !Number.isInteger(grammarPointId)) {
    return NextResponse.json({ error: "grammarPointId required" }, { status: 400 });
  }
  // Reveal+retype makes this binary: a miss before the correct retype, or not.
  if (incorrectCount !== 0 && incorrectCount !== 1) {
    return NextResponse.json({ error: "incorrectCount must be 0 or 1" }, { status: 400 });
  }
  try {
    const result = await completeGrammarReview(userId, grammarPointId, incorrectCount);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 422 });
  }
}
