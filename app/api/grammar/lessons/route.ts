import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toGrammarPointDTO, toGrammarRelationDTO, toGrammarSentenceDTO } from "@/lib/grammar";
import {
  EXTRA_LESSON_BATCH,
  getPacingSettings,
  grammarLessonsDoneToday,
} from "@/lib/progression";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

// GET — the next grammar points on the fixed sequential path that the user
// hasn't started yet. The relation filter (points with no progress row for
// this user) does the "what's left" computation in one query — no separate
// fetch-then-notIn round trip.
export async function GET(req: NextRequest) {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 5);
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? limitParam : 5;
  // ?extra=1 bypasses the daily limit for one opt-in batch.
  const extra = req.nextUrl.searchParams.get("extra") === "1";

  const [doneToday, { grammarDailyLessonLimit }] = await Promise.all([
    grammarLessonsDoneToday(userId),
    getPacingSettings(userId),
  ]);
  const remainingToday = Math.max(0, grammarDailyLessonLimit - doneToday);
  const batch = extra ? EXTRA_LESSON_BATCH : Math.min(limit, remainingToday);

  const [candidates, total] = await Promise.all([
    batch > 0
      ? prisma.grammarPoint.findMany({
          where: { progress: { none: { userId } } },
          orderBy: { sequence: "asc" },
          take: batch,
          include: { sentences: { orderBy: { position: "asc" } }, relations: true },
        })
      : Promise.resolve([]),
    prisma.grammarPoint.count({ where: { progress: { none: { userId } } } }),
  ]);

  return NextResponse.json({
    total,
    doneToday,
    dailyLimit: grammarDailyLessonLimit,
    extraBatchSize: EXTRA_LESSON_BATCH,
    points: candidates.map((p) => ({
      ...toGrammarPointDTO(p),
      sentences: p.sentences.map(toGrammarSentenceDTO),
      relations: p.relations.map(toGrammarRelationDTO),
    })),
  });
}
