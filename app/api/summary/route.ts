import { NextResponse } from "next/server";
import { reviewAccuracy } from "@/lib/accuracy";
import { prisma } from "@/lib/db";
import { recentMistakeSubjectIds } from "@/lib/mistakes";
import { DAILY_LESSON_LIMIT, getCurrentLevel, lessonsDoneToday } from "@/lib/progression";
import { requireUserId } from "@/lib/user";
import { GURU_STAGE } from "@/lib/srs";

export const dynamic = "force-dynamic";

// The three subject-type columns each stage bar is stacked from.
type SpreadGroup = "radical" | "kanji" | "vocabulary";
function spreadGroup(type: string): SpreadGroup {
  if (type === "radical") return "radical";
  if (type === "kanji") return "kanji";
  return "vocabulary"; // vocabulary + kana_vocabulary
}

export async function GET() {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const now = new Date();
  const currentLevel = await getCurrentLevel(userId);

  const [lessonCount, doneToday, reviewCount, levelKanji, stageGroups] = await Promise.all([
    prisma.assignment.count({ where: { userId, startedAt: null, unlockedAt: { not: null } } }),
    lessonsDoneToday(userId),
    prisma.assignment.count({ where: { userId, availableAt: { lte: now } } }),
    prisma.subject.findMany({
      where: { level: currentLevel, type: "kanji" },
      select: { id: true },
    }),
    prisma.assignment.groupBy({
      by: ["srsStage"],
      where: { userId, startedAt: { not: null } },
      _count: true,
    }),
  ]);

  const passedKanji = await prisma.assignment.count({
    where: { userId, subjectId: { in: levelKanji.map((k) => k.id) }, passedAt: { not: null } },
  });

  // Active Item Spread: active items (Apprentice I → Enlightened, stages 1-8)
  // bucketed by SRS stage and stacked by subject type. Burned items (9) are
  // retired, so they are not part of the "active" spread.
  const activeItems = await prisma.assignment.findMany({
    where: { userId, srsStage: { gte: 1, lte: 8 } },
    select: { srsStage: true, subject: { select: { type: true } } },
  });
  const spread = Array.from({ length: 8 }, (_, i) => ({
    stage: i + 1,
    radical: 0,
    kanji: 0,
    vocabulary: 0,
  }));
  for (const item of activeItems) {
    spread[item.srsStage - 1][spreadGroup(item.subject.type)] += 1;
  }

  // Recent Mistakes: one tile per subject, most recent first; a later correct
  // review removes an item (WaniKani semantics — see lib/mistakes.ts).
  const mistakeIds = await recentMistakeSubjectIds(userId);
  const mistakeSubjects = await prisma.subject.findMany({
    where: { id: { in: mistakeIds } },
    select: { id: true, type: true, characters: true, characterImage: true, slug: true },
  });
  const mistakeById = new Map(mistakeSubjects.map((s) => [s.id, s]));
  const recentMistakes = mistakeIds
    .map((id) => mistakeById.get(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .map((s) => ({
      id: s.id,
      type: s.type,
      characters: s.characters,
      characterImage: s.characterImage,
      slug: s.slug,
    }));

  // Correct Reviews: per-answer accuracy over the past 7 days and the 7 days
  // before that, for the dashboard Learning Zone gauge.
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600_000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 3600_000);
  const accuracyLogs = await prisma.reviewLog.findMany({
    where: { userId, createdAt: { gte: twoWeeksAgo } },
    select: {
      createdAt: true,
      meaningCorrectCount: true,
      readingCorrectCount: true,
      recallCorrectCount: true,
      meaningIncorrectCount: true,
      readingIncorrectCount: true,
      recallIncorrectCount: true,
    },
  });
  const correctReviews = {
    pastWeek: reviewAccuracy(accuracyLogs.filter((l) => l.createdAt >= weekAgo)),
    previousWeek: reviewAccuracy(accuracyLogs.filter((l) => l.createdAt < weekAgo)),
  };

  // Review forecast: next 24h in hourly buckets
  const in24h = new Date(now.getTime() + 24 * 3600_000);
  const upcoming = await prisma.assignment.findMany({
    where: { userId, availableAt: { gt: now, lte: in24h } },
    select: { availableAt: true },
  });
  const forecast: Record<string, number> = {};
  for (const a of upcoming) {
    const bucket = new Date(a.availableAt!);
    bucket.setMinutes(0, 0, 0);
    const key = bucket.toISOString();
    forecast[key] = (forecast[key] ?? 0) + 1;
  }

  const stageCounts: Record<string, number> = {
    apprentice: 0,
    guru: 0,
    master: 0,
    enlightened: 0,
    burned: 0,
  };
  for (const g of stageGroups) {
    if (g.srsStage >= 1 && g.srsStage < GURU_STAGE) stageCounts.apprentice += g._count;
    else if (g.srsStage < 7) stageCounts.guru += g._count;
    else if (g.srsStage === 7) stageCounts.master += g._count;
    else if (g.srsStage === 8) stageCounts.enlightened += g._count;
    else if (g.srsStage === 9) stageCounts.burned += g._count;
  }

  return NextResponse.json({
    currentLevel,
    lessonCount,
    lessonsAvailableToday: Math.min(
      lessonCount,
      Math.max(0, DAILY_LESSON_LIMIT - doneToday),
    ),
    reviewCount,
    levelProgress: {
      passedKanji,
      totalKanji: levelKanji.length,
      threshold: Math.ceil(levelKanji.length * 0.9),
    },
    stageCounts,
    forecast,
    spread,
    recentMistakes,
    correctReviews,
  });
}
