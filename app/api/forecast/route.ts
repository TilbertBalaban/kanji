import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { LEVEL_UP_THRESHOLD, getCurrentLevel } from "@/lib/progression";
import {
  TIME_WINDOWS,
  levelPaceMetric,
  projectCompletion,
  toMetric,
  type WeightedSample,
} from "@/lib/projection";
import { BURNED_STAGE, MASTER_STAGE } from "@/lib/srs";
import { requireUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 3600_000;

// No mistake anywhere in the review — the event that actually advances an item
// a stage, which is what the SRS ladder projection is driven by.
const CLEAN_REVIEW = {
  meaningIncorrectCount: 0,
  readingIncorrectCount: 0,
  recallIncorrectCount: 0,
};

export async function GET() {
  const { userId, response } = await requireUserId();
  if (response) return response;

  const now = new Date();
  const since = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const weekAgo = since(7);
  const monthAgo = since(30);

  const [
    currentLevel,
    totalItems,
    stageGroups,
    startedTotal,
    startedWeek,
    startedMonth,
    firstStarted,
    reviewsTotal,
    reviewsWeek,
    reviewsMonth,
    cleanTotal,
    cleanWeek,
    cleanMonth,
    kanjiPerLevel,
    kanjiPassed,
  ] = await Promise.all([
    getCurrentLevel(userId),
    prisma.subject.count(),
    prisma.assignment.groupBy({ by: ["srsStage"], where: { userId }, _count: true }),
    prisma.assignment.count({ where: { userId, startedAt: { not: null } } }),
    prisma.assignment.count({ where: { userId, startedAt: { gte: weekAgo } } }),
    prisma.assignment.count({ where: { userId, startedAt: { gte: monthAgo } } }),
    prisma.assignment.aggregate({
      where: { userId, startedAt: { not: null } },
      _min: { startedAt: true },
    }),
    prisma.reviewLog.count({ where: { userId } }),
    prisma.reviewLog.count({ where: { userId, createdAt: { gte: weekAgo } } }),
    prisma.reviewLog.count({ where: { userId, createdAt: { gte: monthAgo } } }),
    prisma.reviewLog.count({ where: { userId, ...CLEAN_REVIEW } }),
    prisma.reviewLog.count({ where: { userId, createdAt: { gte: weekAgo }, ...CLEAN_REVIEW } }),
    prisma.reviewLog.count({ where: { userId, createdAt: { gte: monthAgo }, ...CLEAN_REVIEW } }),
    prisma.subject.groupBy({ by: ["level"], where: { type: "kanji" }, _count: true }),
    prisma.assignment.findMany({
      where: { userId, passedAt: { not: null }, subject: { is: { type: "kanji" } } },
      select: { passedAt: true, subject: { select: { level: true } } },
    }),
  ]);

  // Items with no assignment row are still locked behind a future level, and
  // count as "not started" alongside unlocked-but-not-yet-taught lessons.
  const stageCounts = new Array<number>(BURNED_STAGE + 1).fill(0);
  let assigned = 0;
  for (const group of stageGroups) {
    stageCounts[group.srsStage] = group._count;
    assigned += group._count;
  }
  stageCounts[0] += Math.max(0, totalItems - assigned);

  const accountStart = firstStarted._min.startedAt;
  const activeDays = accountStart
    ? Math.max(1, (now.getTime() - accountStart.getTime()) / DAY_MS)
    : 0;

  // A three-day-old account has no 30-day history: measuring its month rate
  // over a full 30 days would report a third of the pace it is actually going.
  const perDay = (counts: number[]): WeightedSample[] =>
    TIME_WINDOWS.map((window, i) => ({
      label: window.label,
      weight: window.weight,
      value:
        activeDays === 0
          ? null
          : counts[i] / Math.max(1, Math.min(window.days ?? activeDays, activeDays)),
    }));

  const share = (clean: number[], total: number[]): WeightedSample[] =>
    TIME_WINDOWS.map((window, i) => ({
      label: window.label,
      weight: window.weight,
      value: total[i] ? clean[i] / total[i] : null,
    }));

  const lessonPace = toMetric(perDay([startedWeek, startedMonth, startedTotal]));
  const passRate = toMetric(
    share([cleanWeek, cleanMonth, cleanTotal], [reviewsWeek, reviewsMonth, reviewsTotal]),
  );
  const levelPace = levelPaceMetric(
    levelUpDates(kanjiPerLevel, kanjiPassed),
    accountStart,
    now,
  );

  const inputs = {
    totalItems,
    stageCounts,
    currentLevel,
    itemsPerDay: lessonPace.blended,
    levelsPerDay: levelPace.blended ? 1 / levelPace.blended : null,
    passRate: passRate.blended,
  };

  return NextResponse.json({
    totalItems,
    lessonPace,
    levelPace,
    passRate,
    master: projectCompletion(MASTER_STAGE, inputs, now),
    burned: projectCompletion(BURNED_STAGE, inputs, now),
  });
}

/**
 * When each level was cleared, reconstructed from kanji pass times — the same
 * rule maybeLevelUp() applies live, replayed over history. UserProgress keeps
 * only the current level, so this is the only record of how fast they came.
 */
function levelUpDates(
  kanjiPerLevel: { level: number; _count: number }[],
  passed: { passedAt: Date | null; subject: { level: number } }[],
): Date[] {
  const passedByLevel = new Map<number, Date[]>();
  for (const row of passed) {
    if (!row.passedAt) continue;
    const dates = passedByLevel.get(row.subject.level) ?? [];
    dates.push(row.passedAt);
    passedByLevel.set(row.subject.level, dates);
  }

  const dates: Date[] = [];
  for (const { level, _count } of kanjiPerLevel) {
    const passedDates = passedByLevel.get(level);
    if (!passedDates) continue;
    const needed = Math.ceil(_count * LEVEL_UP_THRESHOLD);
    if (passedDates.length < needed) continue;
    passedDates.sort((a, b) => a.getTime() - b.getTime());
    dates.push(passedDates[needed - 1]);
  }
  return dates;
}
