import { NextRequest, NextResponse } from "next/server";
import { startGrammarLessons } from "@/lib/progression";
import { requireUserId } from "@/lib/user";

export async function POST(req: NextRequest) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.grammarPointIds)
    ? body.grammarPointIds.filter(
        (n: unknown): n is number => typeof n === "number" && Number.isInteger(n),
      )
    : [];
  await startGrammarLessons(userId, ids);
  return NextResponse.json({ ok: true });
}
