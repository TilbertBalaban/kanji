// Custom vocabulary: user-added words/phrases with their own SRS progression,
// separate from the WaniKani-derived subjects. Pure helpers only — safe to
// import from client components; the DB writes live in lib/progression.ts.

import type { CustomVocab } from "@prisma/client";
import { normalizeAnswer, readingWithoutSlots, type Meaning, type Reading } from "./srs";

export interface CustomVocabDTO {
  id: number;
  characters: string;
  meanings: string[]; // first entry is primary
  readings: string[]; // usually kana; empty = meaning-only item
  notes: string | null;
  srsStage: number;
  availableAt: string | null; // ISO; null once burned
  createdAt: string;
}

export function toCustomVocabDTO(v: CustomVocab): CustomVocabDTO {
  return {
    id: v.id,
    characters: v.characters,
    meanings: JSON.parse(v.meanings),
    readings: JSON.parse(v.readings),
    notes: v.notes,
    srsStage: v.srsStage,
    availableAt: v.availableAt?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
  };
}

/**
 * For each item, the *other* items sharing a meaning — the recall answer
 * checker's sameMeaningVocab shake (see lib/answer-checker.ts), so answering
 * an English prompt with a different word for the same meaning bounces
 * instead of failing. Compare across the user's whole collection, not just
 * the due batch.
 */
export function sameMeaningCustomVocab(
  items: Pick<CustomVocabDTO, "id" | "characters" | "meanings" | "readings">[],
): Map<number, { characters: string; readings: string[] }[]> {
  const result = new Map<number, { characters: string; readings: string[] }[]>();
  for (const item of items) {
    const own = new Set(item.meanings.map(normalizeAnswer));
    const variants = items
      .filter(
        (other) =>
          other.id !== item.id &&
          other.readings.length > 0 &&
          other.meanings.some((m) => own.has(normalizeAnswer(m))),
      )
      .map((other) => ({ characters: other.characters, readings: other.readings }));
    if (variants.length > 0) result.set(item.id, variants);
  }
  return result;
}

/** Which prompts a custom-vocab review asks: meaning always; reading and
 *  recall (English → reading) only when the item has a reading. */
export function tasksForCustomVocab(item: Pick<CustomVocabDTO, "readings">): {
  reading: boolean;
  recall: boolean;
} {
  return { reading: item.readings.length > 0, recall: item.readings.length > 0 };
}

// Adapters into the shapes checkMeaning/checkReading and QuizCard expect:
// every stored entry is an accepted answer, the first one is primary.
export function asMeanings(meanings: string[]): Meaning[] {
  return meanings.map((meaning, i) => ({ meaning, primary: i === 0, acceptedAnswer: true }));
}

export function asReadings(readings: string[]): Reading[] {
  return readings.map((reading, i) => ({ reading, primary: i === 0, acceptedAnswer: true }));
}

// ---------- Input parsing / validation ----------

// Hiragana, katakana (incl. halfwidth), kanji and their iteration marks,
// prolonged-sound mark, middle dot and whitespace — what a reading may consist
// of, once its slots (〜 and [placeholders], see lib/srs.ts) have been taken
// out. Stripping first means a slot may hold anything — "[years]さいです" —
// while the rest still has to be Japanese, and a reading that is nothing but
// slots is rejected along with the empty string.
//
// Kanji are allowed so a reading can be written the way the phrase reads
// ("[years]歳です"), but note that reading answers are typed in kana: a kanji
// in a reading can never be matched, so add a kana spelling as a second
// reading if you want the reading question to be answerable.
const JAPANESE_ONLY = /^[ぁ-ゖゝゞァ-ヶーヽヾ・ｦ-ﾟ一-龯々〆〇\s]+$/u;

function isJapaneseReading(reading: string): boolean {
  return JAPANESE_ONLY.test(readingWithoutSlots(reading));
}

export interface CustomVocabInput {
  characters: string;
  meanings: string[];
  readings: string[];
  notes: string | null;
}

/**
 * Split a comma/、-separated list into trimmed non-empty entries. Separators
 * inside a [placeholder] belong to the entry — "[years, ages]さいです" is one
 * reading, not two.
 */
export function splitList(raw: string): string[] {
  const entries: string[] = [];
  let current = "";
  let inBracket = false;
  for (const ch of raw) {
    if (ch === "[" || ch === "［") inBracket = true;
    else if (ch === "]" || ch === "］") inBracket = false;
    else if (!inBracket && /[,;、；]/.test(ch)) {
      entries.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  entries.push(current);
  return entries.map((s) => s.trim()).filter(Boolean);
}

/**
 * Validate a create/update payload. Returns the normalized input, or a
 * human-readable error string. Meanings/readings accept either arrays or a
 * single separator-joined string (the form sends strings).
 */
export function parseCustomVocabInput(body: unknown): CustomVocabInput | string {
  const b = (body ?? {}) as Record<string, unknown>;

  const characters = typeof b.characters === "string" ? b.characters.trim() : "";
  if (!characters) return "The Japanese word/phrase is required.";
  if (characters.length > 100) return "The word/phrase is too long (max 100 characters).";

  const rawMeanings = Array.isArray(b.meanings)
    ? b.meanings.map(String)
    : typeof b.meanings === "string"
      ? splitList(b.meanings)
      : [];
  const meanings = rawMeanings.map((s) => s.trim()).filter(Boolean);
  if (meanings.length === 0) return "At least one meaning is required.";
  if (meanings.some((m) => m.length > 100)) return "A meaning is too long (max 100 characters).";

  const rawReadings = Array.isArray(b.readings)
    ? b.readings.map(String)
    : typeof b.readings === "string"
      ? splitList(b.readings)
      : [];
  const readings = rawReadings.map((s) => s.trim()).filter(Boolean);
  if (readings.some((r) => !isJapaneseReading(r))) {
    return "Readings must be written in Japanese, not rōmaji — 〜 and [placeholders] are fine (〜にみえます, [years]さいです).";
  }
  if (readings.some((r) => r.length > 100)) return "A reading is too long (max 100 characters).";

  const notes = typeof b.notes === "string" && b.notes.trim() ? b.notes.trim() : null;
  if (notes && notes.length > 2000) return "Notes are too long (max 2000 characters).";

  return { characters, meanings, readings, notes };
}
