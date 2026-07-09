import { prisma } from "./db";

// Longest synonym WaniKani accepts; keep parity so imported data round-trips.
export const MAX_SYNONYM_LENGTH = 64;

/**
 * Clean a user-supplied synonym: trim, collapse internal whitespace, cap length.
 * Returns null when nothing usable remains (empty or whitespace-only).
 */
export function normalizeSynonym(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/\s+/g, " ").slice(0, MAX_SYNONYM_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

/** Map subjectId → the user's synonyms for it, in insertion order. */
export async function synonymsBySubject(
  userId: string,
  subjectIds: number[],
): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (subjectIds.length === 0) return map;

  const rows = await prisma.userSynonym.findMany({
    where: { userId, subjectId: { in: subjectIds } },
    orderBy: { createdAt: "asc" },
    select: { subjectId: true, synonym: true },
  });

  for (const { subjectId, synonym } of rows) {
    const list = map.get(subjectId);
    if (list) list.push(synonym);
    else map.set(subjectId, [synonym]);
  }
  return map;
}
