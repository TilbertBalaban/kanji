import { prisma } from "./db";
import { GURU_STAGE, nextAvailableAt, nextStage } from "./srs";

const LEVEL_UP_THRESHOLD = 0.9; // pass 90% of a level's kanji to level up

export const DAILY_LESSON_LIMIT = 10;
export const EXTRA_LESSON_BATCH = 5; // opt-in batch size once the daily limit is reached

/**
 * Set up a user's progress the first time they log in: level 1 with the
 * level-1 radicals unlocked. Idempotent — safe to call on every login.
 */
export async function ensureUserInitialized(userId: string) {
  const existing = await prisma.userProgress.findUnique({ where: { userId } });
  if (existing) return;

  await prisma.userProgress.create({ data: { userId, currentLevel: 1 } });

  const level1Radicals = await prisma.subject.findMany({
    where: { level: 1, type: "radical" },
    select: { id: true },
  });
  const now = new Date();
  await prisma.assignment.createMany({
    data: level1Radicals.map((r) => ({ userId, subjectId: r.id, unlockedAt: now })),
  });
}

/** Lessons completed since local midnight (startedAt is set when a lesson batch finishes). */
export async function lessonsDoneToday(userId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return prisma.assignment.count({ where: { userId, startedAt: { gte: startOfDay } } });
}

export async function getCurrentLevel(userId: string): Promise<number> {
  const progress = await prisma.userProgress.findUnique({ where: { userId } });
  return progress?.currentLevel ?? 1;
}

/**
 * Apply a finished review (both meaning and reading answered) to an assignment:
 * SRS transition, review log, then unlock cascade if the item just passed Guru.
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
  });
  if (!assignment || !assignment.startedAt) {
    throw new Error(`No started assignment for subject ${subjectId}`);
  }

  const incorrect = meaningIncorrectCount + readingIncorrectCount + recallIncorrectCount;
  const startingStage = assignment.srsStage;
  const endingStage = nextStage(startingStage, incorrect);
  const now = new Date();
  const justPassed = endingStage >= GURU_STAGE && !assignment.passedAt;

  await prisma.$transaction([
    prisma.assignment.update({
      where: { userId_subjectId: { userId, subjectId } },
      data: {
        srsStage: endingStage,
        availableAt: nextAvailableAt(endingStage, now),
        passedAt: justPassed ? now : assignment.passedAt,
        burnedAt: endingStage === 9 ? now : null,
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

/** Unlock subjects that use this one as a component, once all components passed. */
async function unlockAmalgamations(userId: string, subjectId: number): Promise<number[]> {
  const subject = await prisma.subject.findUniqueOrThrow({ where: { id: subjectId } });
  const amalgamationIds: number[] = JSON.parse(subject.amalgamationIds);
  if (amalgamationIds.length === 0) return [];

  const currentLevel = await getCurrentLevel(userId);
  const candidates = await prisma.subject.findMany({
    where: { id: { in: amalgamationIds }, level: { lte: currentLevel } },
  });

  const unlocked: number[] = [];
  for (const candidate of candidates) {
    const existing = await prisma.assignment.findUnique({
      where: { userId_subjectId: { userId, subjectId: candidate.id } },
    });
    if (existing) continue;
    if (await allComponentsPassed(userId, JSON.parse(candidate.componentIds))) {
      await prisma.assignment.create({
        data: { userId, subjectId: candidate.id, unlockedAt: new Date() },
      });
      unlocked.push(candidate.id);
    }
  }
  return unlocked;
}

async function allComponentsPassed(userId: string, componentIds: number[]): Promise<boolean> {
  if (componentIds.length === 0) return true;
  const passed = await prisma.assignment.count({
    where: { userId, subjectId: { in: componentIds }, passedAt: { not: null } },
  });
  return passed === componentIds.length;
}

/** Level up when ≥90% of the current level's kanji have passed Guru. */
async function maybeLevelUp(userId: string): Promise<number | null> {
  const currentLevel = await getCurrentLevel(userId);
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
  const subjects = await prisma.subject.findMany({ where: { level } });
  const now = new Date();
  for (const subject of subjects) {
    const existing = await prisma.assignment.findUnique({
      where: { userId_subjectId: { userId, subjectId: subject.id } },
    });
    if (existing) continue;
    const componentIds: number[] = JSON.parse(subject.componentIds);
    const shouldUnlock =
      subject.type === "radical"
        ? true
        : await allComponentsPassed(userId, componentIds);
    if (shouldUnlock) {
      await prisma.assignment.create({
        data: { userId, subjectId: subject.id, unlockedAt: now },
      });
    }
  }
}

/** Move freshly-taught lessons into the review queue at Apprentice I. */
export async function startLessons(userId: string, subjectIds: number[]) {
  const now = new Date();
  await prisma.assignment.updateMany({
    where: { userId, subjectId: { in: subjectIds }, startedAt: null },
    data: {
      srsStage: 1,
      startedAt: now,
      availableAt: nextAvailableAt(1, now),
    },
  });
}
