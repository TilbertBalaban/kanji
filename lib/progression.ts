import { prisma } from "./db";
import {
  BURNED_STAGE,
  GURU_STAGE,
  INACTIVITY_PAUSE_DAYS,
  MAX_LEVEL,
  inactivityShiftMs,
  nextAvailableAt,
  nextStage,
  tasksForSubject,
} from "./srs";

const LEVEL_UP_THRESHOLD = 0.9; // pass 90% of a level's kanji to level up

export const EXTRA_LESSON_BATCH = 5; // opt-in batch size once the daily limit is reached

// Defaults live on UserProgress (dailyLessonLimit/grammarDailyLessonLimit) so
// each user can tune their own pace from /profile — see getLessonLimits.
export const DEFAULT_DAILY_LESSON_LIMIT = 10;
export const DEFAULT_GRAMMAR_DAILY_LESSON_LIMIT = 2;

const MIN_LESSON_LIMIT = 1;
const MAX_LESSON_LIMIT = 200;

/** The user's configured daily lesson caps, defaulting a missing row to the constants above. */
export async function getLessonLimits(
  userId: string,
): Promise<{ dailyLessonLimit: number; grammarDailyLessonLimit: number }> {
  const progress = await prisma.userProgress.findUnique({
    where: { userId },
    select: { dailyLessonLimit: true, grammarDailyLessonLimit: true },
  });
  return {
    dailyLessonLimit: progress?.dailyLessonLimit ?? DEFAULT_DAILY_LESSON_LIMIT,
    grammarDailyLessonLimit: progress?.grammarDailyLessonLimit ?? DEFAULT_GRAMMAR_DAILY_LESSON_LIMIT,
  };
}

/** Update one or both daily lesson caps; each must be an integer in [1, 200]. */
export async function setLessonLimits(
  userId: string,
  limits: { dailyLessonLimit?: number; grammarDailyLessonLimit?: number },
) {
  const data: { dailyLessonLimit?: number; grammarDailyLessonLimit?: number } = {};
  for (const [key, value] of Object.entries(limits) as [
    "dailyLessonLimit" | "grammarDailyLessonLimit",
    number | undefined,
  ][]) {
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < MIN_LESSON_LIMIT || value > MAX_LESSON_LIMIT) {
      throw new Error(`${key} must be an integer between ${MIN_LESSON_LIMIT} and ${MAX_LESSON_LIMIT}`);
    }
    data[key] = value;
  }
  if (Object.keys(data).length === 0) return;
  await prisma.userProgress.update({ where: { userId }, data });
}

/**
 * Set up a user's progress the first time they log in: level 1 with the
 * level-1 radicals unlocked. Idempotent AND race-safe — a new user's first
 * page load fires several API requests in parallel, so concurrent calls must
 * not conflict (upsert + skipDuplicates instead of check-then-create).
 */
export async function ensureUserInitialized(userId: string) {
  const existing = await prisma.userProgress.findUnique({ where: { userId } });
  if (existing) return;

  await prisma.userProgress.upsert({
    where: { userId },
    create: { userId, currentLevel: 1 },
    update: {},
  });

  const level1Radicals = await prisma.subject.findMany({
    where: { level: 1, type: "radical" },
    select: { id: true },
  });
  const now = new Date();
  await prisma.assignment.createMany({
    data: level1Radicals.map((r) => ({ userId, subjectId: r.id, unlockedAt: now })),
    skipDuplicates: true,
  });
}

/**
 * Lessons completed since midnight (startedAt is set when a lesson batch
 * finishes). Midnight is computed in LESSON_TZ (an IANA name like
 * "Europe/Kiev") when set; otherwise in the server's timezone — set LESSON_TZ
 * wherever server time (UTC on Vercel) isn't the user's day boundary.
 */
export async function lessonsDoneToday(userId: string): Promise<number> {
  return prisma.assignment.count({
    where: { userId, startedAt: { gte: startOfToday() } },
  });
}

/** Grammar lessons completed since midnight — see lessonsDoneToday. */
export async function grammarLessonsDoneToday(userId: string): Promise<number> {
  return prisma.grammarProgress.count({
    where: { userId, startedAt: { gte: startOfToday() } },
  });
}

function startOfToday(now = new Date()): Date {
  const tz = process.env.LESSON_TZ;
  if (!tz) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const msIntoDay =
    (((get("hour") % 24) * 60 + get("minute")) * 60 + get("second")) * 1000 +
    now.getMilliseconds();
  return new Date(now.getTime() - msIntoDay);
}

/**
 * The latest availableAt that counts as "due" for this user. Normally `now`,
 * but once the user has gone INACTIVITY_PAUSE_DAYS without completing a
 * lesson or review, the queue freezes at lastActivityAt + the window: later
 * reviews stop accumulating until they do a review (see markActivity — merely
 * looking at the queue does not restart the clock). Every endpoint that
 * serves or counts due reviews must filter with this bound.
 */
export async function reviewsDueBefore(userId: string, now: Date = new Date()): Promise<Date> {
  const progress = await prisma.userProgress.findUnique({ where: { userId } });
  if (!progress) return now;
  const cutoff = new Date(
    progress.lastActivityAt.getTime() + INACTIVITY_PAUSE_DAYS * 24 * 3600_000,
  );
  return cutoff < now ? cutoff : now;
}

/**
 * Restart the inactivity clock: called when the user completes a lesson batch
 * or a review — never from a read path. If they were away beyond the pause
 * window, first push every review (incl. custom vocab) that came due after
 * the freeze point forward by the time missed, so the schedule resumes from
 * now with only the window's backlog intact. Must run before the caller
 * writes its own availableAt, so fresh dates are never shifted. The
 * optimistic lastActivityAt claim makes concurrent calls shift exactly once.
 */
async function markActivity(userId: string, now: Date) {
  const progress = await prisma.userProgress.findUnique({ where: { userId } });
  if (!progress) return;

  const claimed = await prisma.userProgress.updateMany({
    where: { userId, lastActivityAt: progress.lastActivityAt },
    data: { lastActivityAt: now },
  });
  if (claimed.count === 0) return; // a concurrent call already stamped/shifted

  const shiftMs = inactivityShiftMs(progress.lastActivityAt, now);
  if (shiftMs === null) return;
  const cutoff = new Date(now.getTime() - shiftMs);

  const shiftSecs = shiftMs / 1000;
  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "Assignment"
      SET "availableAt" = "availableAt" + make_interval(secs => ${shiftSecs})
      WHERE "userId" = ${userId} AND "availableAt" > ${cutoff}`,
    prisma.$executeRaw`
      UPDATE "CustomVocab"
      SET "availableAt" = "availableAt" + make_interval(secs => ${shiftSecs})
      WHERE "userId" = ${userId} AND "availableAt" > ${cutoff}`,
    prisma.$executeRaw`
      UPDATE "GrammarProgress"
      SET "availableAt" = "availableAt" + make_interval(secs => ${shiftSecs})
      WHERE "userId" = ${userId} AND "availableAt" > ${cutoff}`,
  ]);
}

export async function getCurrentLevel(userId: string): Promise<number> {
  const progress = await prisma.userProgress.findUnique({ where: { userId } });
  return progress?.currentLevel ?? 1;
}

/**
 * Apply a finished review (every asked prompt answered) to an assignment:
 * SRS transition, review log, then unlock cascade if the item just passed
 * Guru. Rejects assignments that aren't due, so a replayed or double-submitted
 * completion can't advance an item twice.
 */
export async function completeReview(
  userId: string,
  subjectId: number,
  meaningIncorrectCount: number,
  readingIncorrectCount: number,
  recallIncorrectCount: number = 0,
) {
  const assignment = await prisma.assignment.findUnique({
    where: { userId_subjectId: { userId, subjectId } },
    include: { subject: { select: { type: true, readings: true } } },
  });
  if (!assignment || !assignment.startedAt) {
    throw new Error(`No started assignment for subject ${subjectId}`);
  }
  const now = new Date();
  if (!assignment.availableAt || assignment.availableAt > now) {
    throw new Error(`Review is not due for subject ${subjectId}`);
  }

  // One correct answer per prompt the review actually asked (see
  // tasksForSubject — the same rule drives the quiz UI).
  const tasks = tasksForSubject({
    type: assignment.subject.type,
    readings: JSON.parse(assignment.subject.readings),
  });
  const meaningCorrectCount = 1;
  const readingCorrectCount = tasks.reading ? 1 : 0;
  const recallCorrectCount = tasks.recall ? 1 : 0;

  const incorrect = meaningIncorrectCount + readingIncorrectCount + recallIncorrectCount;
  const startingStage = assignment.srsStage;
  const endingStage = nextStage(startingStage, incorrect);
  const justPassed = endingStage >= GURU_STAGE && !assignment.passedAt;

  await markActivity(userId, now);

  await prisma.$transaction([
    prisma.assignment.update({
      where: { userId_subjectId: { userId, subjectId } },
      data: {
        srsStage: endingStage,
        availableAt: nextAvailableAt(endingStage, now),
        passedAt: justPassed ? now : assignment.passedAt,
        burnedAt: endingStage === BURNED_STAGE ? now : null,
      },
    }),
    prisma.reviewLog.create({
      data: {
        userId,
        subjectId,
        startingStage,
        endingStage,
        meaningIncorrectCount,
        readingIncorrectCount,
        recallIncorrectCount,
        meaningCorrectCount,
        readingCorrectCount,
        recallCorrectCount,
      },
    }),
  ]);

  let unlockedIds: number[] = [];
  let leveledUpTo: number | null = null;
  if (justPassed) {
    unlockedIds = await unlockAmalgamations(userId, subjectId);
    leveledUpTo = await maybeLevelUp(userId);
  }

  return { startingStage, endingStage, unlockedIds, leveledUpTo };
}

/**
 * Apply a finished review to a custom-vocab item: same stage math as
 * completeReview, but on the item's embedded SRS state — no review log, no
 * unlock cascade, no level-up. Rejects items that aren't due, so a replayed
 * completion can't advance an item twice.
 */
export async function completeCustomVocabReview(
  userId: string,
  id: number,
  meaningIncorrectCount: number,
  readingIncorrectCount: number,
  recallIncorrectCount: number = 0,
) {
  const item = await prisma.customVocab.findUnique({ where: { id } });
  if (!item || item.userId !== userId) {
    throw new Error(`No custom vocab item ${id}`);
  }
  const now = new Date();
  if (!item.availableAt || item.availableAt > now) {
    throw new Error(`Review is not due for custom vocab item ${id}`);
  }

  const incorrect = meaningIncorrectCount + readingIncorrectCount + recallIncorrectCount;
  const startingStage = item.srsStage;
  const endingStage = nextStage(startingStage, incorrect);
  const justPassed = endingStage >= GURU_STAGE && !item.passedAt;

  await markActivity(userId, now);

  await prisma.customVocab.update({
    where: { id },
    data: {
      srsStage: endingStage,
      availableAt: nextAvailableAt(endingStage, now),
      passedAt: justPassed ? now : item.passedAt,
      burnedAt: endingStage === BURNED_STAGE ? now : null,
    },
  });

  return { startingStage, endingStage };
}

/**
 * Create assignments for the candidates that aren't assigned yet and whose
 * components have all passed (or that always unlock, i.e. radicals). Batched:
 * two reads + one createMany regardless of candidate count.
 */
async function unlockEligible(
  userId: string,
  candidates: { id: number; componentIds: number[]; alwaysUnlock?: boolean }[],
): Promise<number[]> {
  if (candidates.length === 0) return [];
  const candidateIds = candidates.map((c) => c.id);
  const allComponentIds = [...new Set(candidates.flatMap((c) => c.componentIds))];

  const [existing, passed] = await Promise.all([
    prisma.assignment.findMany({
      where: { userId, subjectId: { in: candidateIds } },
      select: { subjectId: true },
    }),
    allComponentIds.length
      ? prisma.assignment.findMany({
          where: { userId, subjectId: { in: allComponentIds }, passedAt: { not: null } },
          select: { subjectId: true },
        })
      : Promise.resolve([]),
  ]);
  const existingIds = new Set(existing.map((a) => a.subjectId));
  const passedIds = new Set(passed.map((a) => a.subjectId));

  const unlocked = candidates
    .filter((c) => !existingIds.has(c.id))
    .filter((c) => c.alwaysUnlock || c.componentIds.every((id) => passedIds.has(id)))
    .map((c) => c.id);

  if (unlocked.length > 0) {
    const now = new Date();
    await prisma.assignment.createMany({
      data: unlocked.map((subjectId) => ({ userId, subjectId, unlockedAt: now })),
      skipDuplicates: true,
    });
  }
  return unlocked;
}

/** Unlock subjects that use this one as a component, once all components passed. */
async function unlockAmalgamations(userId: string, subjectId: number): Promise<number[]> {
  const subject = await prisma.subject.findUniqueOrThrow({ where: { id: subjectId } });
  const amalgamationIds: number[] = JSON.parse(subject.amalgamationIds);
  if (amalgamationIds.length === 0) return [];

  const currentLevel = await getCurrentLevel(userId);
  const candidates = await prisma.subject.findMany({
    where: { id: { in: amalgamationIds }, level: { lte: currentLevel } },
    select: { id: true, componentIds: true },
  });
  return unlockEligible(
    userId,
    candidates.map((c) => ({ id: c.id, componentIds: JSON.parse(c.componentIds) })),
  );
}

/** Level up when ≥90% of the current level's kanji have passed Guru. */
async function maybeLevelUp(userId: string): Promise<number | null> {
  const currentLevel = await getCurrentLevel(userId);
  if (currentLevel >= MAX_LEVEL) return null;
  const kanji = await prisma.subject.findMany({
    where: { level: currentLevel, type: "kanji" },
    select: { id: true },
  });
  if (kanji.length === 0) return null;

  const passed = await prisma.assignment.count({
    where: { userId, subjectId: { in: kanji.map((k) => k.id) }, passedAt: { not: null } },
  });
  if (passed / kanji.length < LEVEL_UP_THRESHOLD) return null;

  const newLevel = currentLevel + 1;
  await prisma.userProgress.update({
    where: { userId },
    data: { currentLevel: newLevel },
  });
  await unlockLevel(userId, newLevel);
  return newLevel;
}

/** Unlock a level's radicals plus any subject whose components already passed. */
export async function unlockLevel(userId: string, level: number) {
  const subjects = await prisma.subject.findMany({
    where: { level },
    select: { id: true, type: true, componentIds: true },
  });
  await unlockEligible(
    userId,
    subjects.map((s) => ({
      id: s.id,
      componentIds: JSON.parse(s.componentIds),
      alwaysUnlock: s.type === "radical",
    })),
  );
}

/**
 * Move freshly-taught lessons into the review queue at Apprentice I. The
 * write path enforces the same pacing the read path serves: at most the
 * day's remaining lessons, or one opt-in extra batch once the limit is hit —
 * so a hand-crafted request can't start the whole queue at once.
 */
export async function startLessons(userId: string, subjectIds: number[]) {
  const [{ dailyLessonLimit }, doneToday] = await Promise.all([
    getLessonLimits(userId),
    lessonsDoneToday(userId),
  ]);
  const remainingToday = Math.max(0, dailyLessonLimit - doneToday);
  const allowed = Math.max(remainingToday, EXTRA_LESSON_BATCH);
  const ids = subjectIds.slice(0, allowed);
  if (ids.length === 0) return;

  const now = new Date();
  await markActivity(userId, now);
  await prisma.assignment.updateMany({
    where: { userId, subjectId: { in: ids }, startedAt: null },
    data: {
      srsStage: 1,
      startedAt: now,
      availableAt: nextAvailableAt(1, now),
    },
  });
}

/**
 * Apply a finished grammar review (one cloze prompt, reveal+retype on a miss)
 * to a GrammarProgress row: same stage math as completeReview, but no review
 * log dimensions beyond the single incorrectCount/correctCount pair, no
 * unlock cascade, no level-up. incorrectCount is binary — see
 * lib/grammar-answer-checker.ts and the page's reveal+retype state machine:
 * only the first miss before the correct retype counts, so it's always 0 or
 * 1 regardless of how many failed retypes happened after the reveal. Rejects
 * progress that isn't due, so a replayed completion can't advance it twice.
 */
export async function completeGrammarReview(
  userId: string,
  grammarPointId: number,
  incorrectCount: number,
) {
  const progress = await prisma.grammarProgress.findUnique({
    where: { userId_grammarPointId: { userId, grammarPointId } },
  });
  if (!progress || !progress.startedAt) {
    throw new Error(`No started grammar progress for point ${grammarPointId}`);
  }
  const now = new Date();
  if (!progress.availableAt || progress.availableAt > now) {
    throw new Error(`Review is not due for grammar point ${grammarPointId}`);
  }

  const startingStage = progress.srsStage;
  const endingStage = nextStage(startingStage, incorrectCount);
  const justPassed = endingStage >= GURU_STAGE && !progress.passedAt;

  const sentenceCount = await prisma.grammarSentence.count({ where: { grammarPointId } });
  const nextCursor = sentenceCount > 0 ? (progress.sentenceCursor + 1) % sentenceCount : 0;

  await markActivity(userId, now);

  await prisma.$transaction([
    prisma.grammarProgress.update({
      where: { userId_grammarPointId: { userId, grammarPointId } },
      data: {
        srsStage: endingStage,
        availableAt: nextAvailableAt(endingStage, now),
        passedAt: justPassed ? now : progress.passedAt,
        burnedAt: endingStage === BURNED_STAGE ? now : null,
        sentenceCursor: nextCursor,
      },
    }),
    prisma.grammarReviewLog.create({
      data: {
        userId,
        grammarPointId,
        startingStage,
        endingStage,
        incorrectCount,
        correctCount: 1,
      },
    }),
  ]);

  return { startingStage, endingStage };
}

/**
 * Move freshly-taught grammar points into the review queue at Apprentice I.
 * Unlike startLessons, GrammarProgress rows don't pre-exist (there's no
 * unlock cascade creating them ahead of time), so this creates them directly
 * rather than updating placeholders. Like startLessons, the write path
 * enforces what the read path serves: only the next points on the fixed
 * sequential path, at most the day's remaining count (or one opt-in extra
 * batch) — a hand-crafted request can't skip ahead or start the whole
 * catalog, and unknown ids never reach createMany's FK.
 */
export async function startGrammarLessons(userId: string, grammarPointIds: number[]) {
  const [{ grammarDailyLessonLimit }, doneToday] = await Promise.all([
    getLessonLimits(userId),
    grammarLessonsDoneToday(userId),
  ]);
  const remainingToday = Math.max(0, grammarDailyLessonLimit - doneToday);
  const allowed = Math.max(remainingToday, EXTRA_LESSON_BATCH);

  const eligible = await prisma.grammarPoint.findMany({
    where: { progress: { none: { userId } } },
    orderBy: { sequence: "asc" },
    take: allowed,
    select: { id: true },
  });
  const eligibleIds = new Set(eligible.map((p) => p.id));
  const ids = grammarPointIds.filter((id) => eligibleIds.has(id));
  if (ids.length === 0) return;

  const now = new Date();
  await markActivity(userId, now);
  await prisma.grammarProgress.createMany({
    data: ids.map((grammarPointId) => ({
      userId,
      grammarPointId,
      srsStage: 1,
      startedAt: now,
      availableAt: nextAvailableAt(1, now),
    })),
    skipDuplicates: true,
  });
}
