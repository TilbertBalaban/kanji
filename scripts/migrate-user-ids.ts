// One-off helper for the move to Clerk: reassign all rows keyed by an old
// local user name ("Tilbert" / "Kate") to a Clerk user id, so existing SRS
// progress survives the auth change.
//
// Find the Clerk id on the user's page in https://dashboard.clerk.com
// (it looks like "user_2abc...").
//
// Usage: npm run migrate:user -- Tilbert user_2abc123...

import { prisma } from "../lib/db";

const [oldId, newId] = process.argv.slice(2);
if (!oldId || !newId) {
  console.error("Usage: npm run migrate:user -- <old-user-id> <clerk-user-id>");
  process.exit(1);
}

/**
 * Signing in for the first time auto-creates starter rows for the Clerk user
 * (level 1 + unlocked level-1 radicals — see ensureUserInitialized). Those are
 * safe to replace; anything beyond that means real progress we must not clobber.
 */
async function hasRealProgress(userId: string): Promise<boolean> {
  const progress = await prisma.userProgress.findUnique({ where: { userId } });
  if (progress && progress.currentLevel > 1) return true;
  const [started, logs, synonyms, notes] = await Promise.all([
    prisma.assignment.count({
      where: { userId, OR: [{ startedAt: { not: null } }, { srsStage: { gt: 0 } }] },
    }),
    prisma.reviewLog.count({ where: { userId } }),
    prisma.userSynonym.count({ where: { userId } }),
    prisma.userNote.count({ where: { userId } }),
  ]);
  return started + logs + synonyms + notes > 0;
}

async function main() {
  const oldProgress = await prisma.userProgress.findUnique({ where: { userId: oldId } });
  if (!oldProgress) {
    console.error(`No progress rows found for "${oldId}" — nothing to migrate.`);
    process.exit(1);
  }
  if (await hasRealProgress(newId)) {
    console.error(`"${newId}" already has real progress — refusing to overwrite.`);
    process.exit(1);
  }

  const data = { userId: newId };
  const where = { userId: oldId };
  // One transaction: drop the auto-initialized starter rows for the Clerk id
  // (created on first sign-in), then move the old user's rows into their place.
  const [delProgress, delAssignments, progress, assignments, reviewLogs, synonyms, notes] =
    await prisma.$transaction([
      prisma.userProgress.deleteMany({ where: { userId: newId } }),
      prisma.assignment.deleteMany({ where: { userId: newId } }),
      prisma.userProgress.updateMany({ where, data }),
      prisma.assignment.updateMany({ where, data }),
      prisma.reviewLog.updateMany({ where, data }),
      prisma.userSynonym.updateMany({ where, data }),
      prisma.userNote.updateMany({ where, data }),
    ]);

  const deletedCount = delProgress.count + delAssignments.count;
  if (deletedCount > 0) {
    console.log(`Removed ${deletedCount} auto-initialized starter rows for "${newId}".`);
  }
  console.log(`Moved "${oldId}" -> "${newId}":`);
  console.log(`  userProgress: ${progress.count}`);
  console.log(`  assignments:  ${assignments.count}`);
  console.log(`  reviewLogs:   ${reviewLogs.count}`);
  console.log(`  synonyms:     ${synonyms.count}`);
  console.log(`  notes:        ${notes.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
