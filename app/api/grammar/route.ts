import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getLessonSettings, grammarLessonsDoneToday, reviewsDueBefore } from "@/lib/progression";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

// GET — the full grammar catalog (for browsing by JLPT level) with each
// point's per-user SRS state, plus the overall due count for the tile.
// Deliberately a slim select, not toGrammarPointDTO: the browse page only
// renders titles/meanings, and shipping ~1000 points' full writeups
// (explanation/aboutIntro/aboutCautions) would be megabytes per load.
export async function GET() {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const [points, progressRows, dueCount, lessonCount, doneToday, { grammarDailyLessonLimit }] =
    await Promise.all([
      prisma.grammarPoint.findMany({
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          title: true,
          jlptLevel: true,
          position: true,
          lessonId: true,
          lessonDescription: true,
          meaning: true,
          slug: true,
        },
      }),
      prisma.grammarProgress.findMany({
        where: { userId },
        select: { grammarPointId: true, srsStage: true, availableAt: true },
      }),
      prisma.grammarProgress.count({
        where: { userId, availableAt: { lte: await reviewsDueBefore(userId) } },
      }),
      prisma.grammarPoint.count({ where: { progress: { none: { userId } } } }),
      grammarLessonsDoneToday(userId),
      getLessonSettings(userId),
    ]);
  const progressByPoint = new Map(progressRows.map((p) => [p.grammarPointId, p]));

  return NextResponse.json({
    points: points.map((p) => {
      const progress = progressByPoint.get(p.id);
      return {
        ...p,
        srsStage: progress?.srsStage ?? null,
        availableAt: progress?.availableAt?.toISOString() ?? null,
      };
    }),
    dueCount,
    lessonCount,
    lessonsAvailableToday: Math.min(
      lessonCount,
      Math.max(0, grammarDailyLessonLimit - doneToday),
    ),
  });
}
