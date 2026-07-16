import { prisma } from "./db";

// Recent Mistakes for grammar, mirroring lib/mistakes.ts: a point you missed
// stays listed for 24 hours, but a later correct review removes it
// immediately — a point is listed iff its most recent log in the past 24h had
// incorrectCount > 0.
//
// Returns deduped grammar point ids, most recent mistake first.
export async function recentMistakeGrammarPointIds(userId: string): Promise<number[]> {
  const dayAgo = new Date(Date.now() - 24 * 3600_000);
  const logs = await prisma.grammarReviewLog.findMany({
    where: { userId, createdAt: { gte: dayAgo } },
    orderBy: { createdAt: "desc" },
    select: { grammarPointId: true, incorrectCount: true },
  });

  const ids: number[] = [];
  const seen = new Set<number>();
  for (const log of logs) {
    if (seen.has(log.grammarPointId)) continue;
    seen.add(log.grammarPointId);
    if (log.incorrectCount > 0) ids.push(log.grammarPointId);
  }
  return ids;
}
