import { prisma } from "./db";

// Recent Mistakes, WaniKani semantics: an item you answered incorrectly stays
// in the list for 24 hours, but answering it correctly in a later review
// removes it immediately. Equivalently: a subject is listed iff its most
// recent review in the past 24h contained a wrong answer.
//
// Returns deduped subject ids, most recent mistake first.
export async function recentMistakeSubjectIds(userId: string): Promise<number[]> {
  const dayAgo = new Date(Date.now() - 24 * 3600_000);
  const logs = await prisma.reviewLog.findMany({
    where: { userId, createdAt: { gte: dayAgo } },
    orderBy: { createdAt: "desc" },
    select: {
      subjectId: true,
      meaningIncorrectCount: true,
      readingIncorrectCount: true,
      recallIncorrectCount: true,
    },
  });

  const ids: number[] = [];
  const seen = new Set<number>();
  for (const log of logs) {
    if (seen.has(log.subjectId)) continue;
    seen.add(log.subjectId);
    const missed =
      log.meaningIncorrectCount > 0 ||
      log.readingIncorrectCount > 0 ||
      log.recallIncorrectCount > 0;
    if (missed) ids.push(log.subjectId);
  }
  return ids;
}
