import { prisma } from "./db";

// Longest note we store; generous but bounded to keep payloads sane.
export const MAX_NOTE_LENGTH = 2000;

export interface SubjectNote {
  meaningNote: string | null;
  readingNote: string | null;
}

export const EMPTY_NOTE: SubjectNote = { meaningNote: null, readingNote: null };

/**
 * Clean a user-supplied note: trim and cap length. An empty/whitespace-only
 * note normalizes to null so it clears the stored value.
 */
export function normalizeNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().slice(0, MAX_NOTE_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

/** The current user's notes for a subject, or empty when none saved. */
export async function noteForSubject(
  userId: string,
  subjectId: number,
): Promise<SubjectNote> {
  const row = await prisma.userNote.findUnique({
    where: { userId_subjectId: { userId, subjectId } },
    select: { meaningNote: true, readingNote: true },
  });
  return row ?? { ...EMPTY_NOTE };
}
