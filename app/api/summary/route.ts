import { NextResponse } from "next/server";
import { reviewAccuracy } from "@/lib/accuracy";
import { prisma } from "@/lib/db";
import { recentMistakeSubjectIds } from "@/lib/mistakes";
import {
  getCurrentLevel,
  getLessonLimits,
  grammarLessonsDoneToday,
  lessonsDoneToday,
  reviewsDueBefore,
} from "@/lib/progression";
import { requireUserId } from "@/lib/user";

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
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600_000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 3600_000);
  const in24h = new Date(now.getTime() + 24 * 3600_000);
  // While the user is inactivity-frozen this is earlier than `now`, so the
  // due counts stop growing until they complete a lesson or review.
  const dueBefore = await reviewsDueBefore(userId, now);

  // Everything here is independent, so one round of parallel queries covers
  // the whole dashboard (only the mistake-subject lookup chains a second one).
  const [
    currentLevel,
    lessonCount,
    doneToday,
    reviewCount,
    customReviewCount,
    grammarReviewCount,
    grammarLessonCount,
    grammarDoneToday,
    activeItems,
    mistakeIds,
    accuracyLogs,
    upcoming,
    { dailyLessonLimit, grammarDailyLessonLimit },
  ] = await Promise.all([
      getCurrentLevel(userId),
      prisma.assignment.count({ where: { userId, startedAt: null, unlockedAt: { not: null } } }),
      lessonsDoneToday(userId),
      prisma.assignment.count({ where: { userId, availableAt: { lte: dueBefore } } }),
      // Custom vocabulary due — its own SRS, surfaced as a dashboard tile.
      prisma.customVocab.count({ where: { userId, availableAt: { lte: dueBefore } } }),
      // Grammar due/lessons — its own SRS, surfaced as dashboard tiles too
      // (everything else about it lives on /grammar, not the main dashboard).
      prisma.grammarProgress.count({ where: { userId, availableAt: { lte: dueBefore } } }),
      prisma.grammarPoint.count({ where: { progress: { none: { userId } } } }),
      grammarLessonsDoneToday(userId),
      // Active Item Spread: active items (Apprentice I → Enlightened, stages
      // 1-8) bucketed by SRS stage and stacked by subject type. Burned items
      // (9) are retired, so they are not part of the "active" spread.
      prisma.assignment.findMany({
        where: { userId, srsStage: { gte: 1, lte: 8 } },
        select: { srsStage: true, subject: { select: { type: true } } },
      }),
      // Recent Mistakes: one tile per subject, most recent first; a later
      // correct review removes an item (WaniKani semantics — see lib/mistakes.ts).
      recentMistakeSubjectIds(userId),
      // Correct Reviews: per-answer accuracy over the past 7 days and the 7
      // days before that, for the dashboard Learning Zone gauge.
      prisma.reviewLog.findMany({
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
      }),
      // Review forecast: next 24h in hourly buckets.
      prisma.assignment.findMany({
        where: { userId, availableAt: { gt: now, lte: in24h } },
        select: { availableAt: true },
      }),
      getLessonLimits(userId),
    ]);

  const spread = Array.from({ length: 8 }, (_, i) => ({
    stage: i + 1,
    radical: 0,
    kanji: 0,
    vocabulary: 0,
  }));
  for (const item of activeItems) {
    spread[item.srsStage - 1][spreadGroup(item.subject.type)] += 1;
  }

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

  const correctReviews = {
    pastWeek: reviewAccuracy(accuracyLogs.filter((l) => l.createdAt >= weekAgo)),
    previousWeek: reviewAccuracy(accuracyLogs.filter((l) => l.createdAt < weekAgo)),
  };

  const forecast: Record<string, number> = {};
  for (const a of upcoming) {
    const bucket = new Date(a.availableAt!);
    bucket.setMinutes(0, 0, 0);
    const key = bucket.toISOString();
    forecast[key] = (forecast[key] ?? 0) + 1;
  }

  return NextResponse.json({
    currentLevel,
    lessonCount,
    lessonsAvailableToday: Math.min(
      lessonCount,
      Math.max(0, dailyLessonLimit - doneToday),
    ),
    reviewCount,
    customReviewCount,
    grammarReviewCount,
    grammarLessonCount,
    grammarLessonsAvailableToday: Math.min(
      grammarLessonCount,
      Math.max(0, grammarDailyLessonLimit - grammarDoneToday),
    ),
    forecast,
    spread,
    recentMistakes,
    correctReviews,
  });
}
