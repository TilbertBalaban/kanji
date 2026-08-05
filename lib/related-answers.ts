// Builds the RelatedAnswers payload the answer checker uses for WaniKani's
// "Oops, we want the X, not the Y." shakes: for each quizzed subject, the
// accepted meanings/readings of *identical-character* subjects of the other
// types (radical 又 ↔ kanji 又 ↔ vocab 〜人 → kanji 人). Vocabulary characters
// are compared with the 〜 placeholder stripped, matching WaniKani (kanji 君
// warns for 〜君's meaning and vice versa).
//
// For vocabulary it additionally collects sameMeaningVocab — the readings of
// *other* vocabulary sharing an accepted meaning (父 ↔ お父さん ↔ 父親 for
// "father") — so recall prompts can shake a right-word-wrong-card answer
// instead of failing it.

import { prisma } from "./db";
import type { RelatedAnswers } from "./answer-checker";
import { isVocabulary, normalizeAnswer, type Meaning, type Reading } from "./srs";

const stripTilde = (characters: string) => characters.replace(/[〜~～]/g, "");

interface SubjectLite {
  id: number;
  type: string;
  characters: string | null;
  meanings: string | Meaning[]; // raw JSON column or already-parsed DTO field
}

const parseMeanings = (meanings: string | Meaning[]): Meaning[] =>
  typeof meanings === "string" ? JSON.parse(meanings) : meanings;

const acceptedMeaningsOf = (meanings: string | Meaning[]): string[] =>
  parseMeanings(meanings)
    .filter((m) => m.acceptedAnswer)
    .map((m) => m.meaning);

/**
 * Every vocabulary subject sharing an accepted meaning with the batch's
 * vocabulary. The quoted-substring `contains` on the JSON column is only a
 * prefilter — exact (normalized) meaning overlap is verified per subject
 * below, so its false positives are harmless.
 */
async function sameMeaningVocabCandidates(subjects: SubjectLite[]) {
  const meanings = new Set<string>();
  for (const s of subjects) {
    if (!isVocabulary(s.type)) continue;
    for (const meaning of acceptedMeaningsOf(s.meanings)) {
      if (!/["\\]/.test(meaning)) meanings.add(meaning);
    }
  }
  if (meanings.size === 0) return [];
  return prisma.subject.findMany({
    where: {
      type: { in: ["vocabulary", "kana_vocabulary"] },
      OR: [...meanings].map((m) => ({
        meanings: { contains: `"${m}"`, mode: "insensitive" as const },
      })),
    },
    select: { id: true, type: true, characters: true, meanings: true, readings: true },
  });
}

export async function relatedAnswersBySubject(
  subjects: SubjectLite[],
): Promise<Map<number, RelatedAnswers>> {
  const keys = new Set<string>();
  for (const s of subjects) {
    if (!s.characters) continue;
    keys.add(s.characters);
    keys.add(stripTilde(s.characters));
  }
  keys.delete("");

  // One query finds every subject sharing characters with the batch (including
  // tilde-stripped forms in both directions, via each candidate's own key),
  // one more the same-meaning vocabulary.
  const [candidates, vocabCandidates] = await Promise.all([
    keys.size
      ? prisma.subject.findMany({
          where: { characters: { in: [...keys] } },
          select: { id: true, type: true, characters: true, meanings: true, readings: true },
        })
      : Promise.resolve([]),
    sameMeaningVocabCandidates(subjects),
  ]);

  const byKey = new Map<string, typeof candidates>();
  for (const c of candidates) {
    const key = stripTilde(c.characters ?? "");
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(c);
    byKey.set(key, list);
  }

  const acceptedMeanings = (json: string): string[] => acceptedMeaningsOf(json);
  const allReadings = (json: string): string[] =>
    (JSON.parse(json) as Reading[]).map((r) => r.reading);
  // Kana vocabulary ships no readings — its characters *are* the reading.
  const acceptedReadings = (c: { type: string; characters: string | null; readings: string }) =>
    c.type === "kana_vocabulary"
      ? c.characters
        ? [c.characters]
        : []
      : (JSON.parse(c.readings) as Reading[])
          .filter((r) => r.acceptedAnswer)
          .map((r) => r.reading);

  // Parse each vocab candidate's meanings once up front — doing it inside the
  // per-subject filter below would JSON.parse every candidate again for every
  // quizzed subject (batch × candidates parses per request).
  const vocabCandidateMeanings = vocabCandidates.map((c) => ({
    candidate: c,
    normalized: acceptedMeaningsOf(c.meanings).map(normalizeAnswer),
  }));

  const result = new Map<number, RelatedAnswers>();
  for (const s of subjects) {
    const related: RelatedAnswers = {};

    const matches = s.characters
      ? (byKey.get(stripTilde(s.characters)) ?? []).filter((c) => c.id !== s.id)
      : [];
    if (s.type === "radical") {
      const kanji = matches.filter((c) => c.type === "kanji");
      if (kanji.length) related.kanjiMeanings = kanji.flatMap((c) => acceptedMeanings(c.meanings));
    } else if (s.type === "kanji") {
      const radicals = matches.filter((c) => c.type === "radical");
      const vocabulary = matches.filter((c) => c.type === "vocabulary" || c.type === "kana_vocabulary");
      if (radicals.length) related.radicalMeanings = radicals.flatMap((c) => acceptedMeanings(c.meanings));
      if (vocabulary.length)
        related.vocabularyMeanings = vocabulary.flatMap((c) => acceptedMeanings(c.meanings));
    } else {
      const kanji = matches.filter((c) => c.type === "kanji");
      if (kanji.length) {
        related.kanjiMeanings = kanji.flatMap((c) => acceptedMeanings(c.meanings));
        related.kanjiReadings = kanji.flatMap((c) => allReadings(c.readings));
      }
    }

    if (isVocabulary(s.type)) {
      const own = new Set(acceptedMeaningsOf(s.meanings).map(normalizeAnswer));
      const variants = vocabCandidateMeanings
        .filter(
          ({ candidate: c, normalized }) =>
            c.id !== s.id && c.characters && normalized.some((m) => own.has(m)),
        )
        .map(({ candidate: c }) => ({ characters: c.characters!, readings: acceptedReadings(c) }))
        .filter((v) => v.readings.length > 0);
      if (variants.length) related.sameMeaningVocab = variants;
    }

    if (Object.keys(related).length > 0) result.set(s.id, related);
  }
  return result;
}
