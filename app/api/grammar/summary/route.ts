import { NextResponse } from "next/server";
import { reviewAccuracy } from "@/lib/accuracy";
import { prisma } from "@/lib/db";
import { sentenceAtCursor, toGrammarPointDTO, toGrammarSentenceDTO } from "@/lib/grammar";
import { recentMistakeGrammarPointIds } from "@/lib/grammar-mistakes";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

// Everything grammar-specific that doesn't belong on the main dashboard: its
// own accuracy gauge, its own 24h forecast, and Recent Mistakes/Extra Study —
// mirrors app/api/summary/route.ts's shape but scoped to GrammarProgress /
// GrammarReviewLog only (see grammar-plan.md).
export async function GET() {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600_000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 3600_000);
  const in24h = new Date(now.getTime() + 24 * 3600_000);

  const [accuracyLogs, upcoming, mistakeIds] = await Promise.all([
    prisma.grammarReviewLog.findMany({
      where: { userId, createdAt: { gte: twoWeeksAgo } },
      select: { createdAt: true, correctCount: true, incorrectCount: true },
    }),
    prisma.grammarProgress.findMany({
      where: { userId, availableAt: { gt: now, lte: in24h } },
      select: { availableAt: true },
    }),
    recentMistakeGrammarPointIds(userId),
  ]);

  const toAccuracyLog = (l: { correctCount: number; incorrectCount: number }) => ({
    meaningCorrectCount: l.correctCount,
    readingCorrectCount: 0,
    recallCorrectCount: 0,
    meaningIncorrectCount: l.incorrectCount,
    readingIncorrectCount: 0,
    recallIncorrectCount: 0,
  });

  const correctReviews = {
    pastWeek: reviewAccuracy(
      accuracyLogs.filter((l) => l.createdAt >= weekAgo).map(toAccuracyLog),
    ),
    previousWeek: reviewAccuracy(
      accuracyLogs.filter((l) => l.createdAt < weekAgo).map(toAccuracyLog),
    ),
  };

  const forecast: Record<string, number> = {};
  for (const p of upcoming) {
    const bucket = new Date(p.availableAt!);
    bucket.setMinutes(0, 0, 0);
    const key = bucket.toISOString();
    forecast[key] = (forecast[key] ?? 0) + 1;
  }

  let recentMistakes: { grammarPoint: ReturnType<typeof toGrammarPointDTO> }[] = [];
  if (mistakeIds.length > 0) {
    const [points, progressRows] = await Promise.all([
      prisma.grammarPoint.findMany({
        where: { id: { in: mistakeIds } },
        include: { sentences: { orderBy: { position: "asc" } } },
      }),
      prisma.grammarProgress.findMany({
        where: { userId, grammarPointId: { in: mistakeIds } },
        select: { grammarPointId: true, sentenceCursor: true },
      }),
    ]);
    const pointById = new Map(points.map((p) => [p.id, p]));
    const cursorByPoint = new Map(progressRows.map((p) => [p.grammarPointId, p.sentenceCursor]));
    recentMistakes = mistakeIds
      .map((id) => {
        const point = pointById.get(id);
        if (!point) return null;
        const sentence = sentenceAtCursor(point.sentences, cursorByPoint.get(id) ?? 0);
        if (!sentence) return null;
        return {
          grammarPoint: toGrammarPointDTO(point),
          sentence: toGrammarSentenceDTO(sentence),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  return NextResponse.json({ correctReviews, forecast, recentMistakes });
}
