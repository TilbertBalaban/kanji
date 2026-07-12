// Builds the RelatedAnswers payload the answer checker uses for WaniKani's
// "Oops, we want the X, not the Y." shakes: for each quizzed subject, the
// accepted meanings/readings of *identical-character* subjects of the other
// types (radical 又 ↔ kanji 又 ↔ vocab 〜人 → kanji 人). Vocabulary characters
// are compared with the 〜 placeholder stripped, matching WaniKani (kanji 君
// warns for 〜君's meaning and vice versa).

import { prisma } from "./db";
import type { RelatedAnswers } from "./answer-checker";
import type { Meaning, Reading } from "./srs";

const stripTilde = (characters: string) => characters.replace(/[〜~～]/g, "");

interface SubjectLite {
  id: number;
  type: string;
  characters: string | null;
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
  if (keys.size === 0) return new Map();

  // One query finds every subject sharing characters with the batch (including
  // tilde-stripped forms in both directions, via each candidate's own key).
  const candidates = await prisma.subject.findMany({
    where: { characters: { in: [...keys] } },
    select: { id: true, type: true, characters: true, meanings: true, readings: true },
  });

  const byKey = new Map<string, typeof candidates>();
  for (const c of candidates) {
    const key = stripTilde(c.characters ?? "");
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(c);
    byKey.set(key, list);
  }

  const acceptedMeanings = (json: string): string[] =>
    (JSON.parse(json) as Meaning[]).filter((m) => m.acceptedAnswer).map((m) => m.meaning);
  const allReadings = (json: string): string[] =>
    (JSON.parse(json) as Reading[]).map((r) => r.reading);

  const result = new Map<number, RelatedAnswers>();
  for (const s of subjects) {
    if (!s.characters) continue;
    const matches = (byKey.get(stripTilde(s.characters)) ?? []).filter((c) => c.id !== s.id);
    if (matches.length === 0) continue;

    const related: RelatedAnswers = {};
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

    if (Object.keys(related).length > 0) result.set(s.id, related);
  }
  return result;
}
