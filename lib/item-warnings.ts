// WaniKani attaches hand-written warning messages to specific plausible-but-wrong
// answers of individual items (its answer checker's "warned" kind — e.g. 〜人
// answered じん). Its public API doesn't expose that list, so this is a curated
// port: entries verified from WaniKani's real review screens. Answers that miss
// this list still get the generic "Oops, we want the vocabulary reading, not the
// kanji reading." shake from the related-answers check.
//
// Add entries as more are spotted in the wild — keyed by the subject's
// characters (tilde variants are normalized, so 〜人 and ～人 both match).

import { toHiragana } from "wanakana";

interface ItemWarning {
  question: "meaning" | "reading";
  answer: string; // the response that triggers the warning
  message: string;
}

const normalizeKey = (characters: string) => characters.replace(/[~～]/g, "〜");

const ITEM_WARNINGS: Record<string, ItemWarning[]> = {
  "〜人": [
    {
      question: "reading",
      answer: "じん",
      message: "That’s possible, but how do you read it when it’s a counter, as in 三人?",
    },
  ],
  内: [
    {
      question: "reading",
      answer: "ない",
      message: "That’s a rare reading in certain compounds, but it’s a standalone word here.",
    },
  ],
};

export function itemWarningFor(
  characters: string | null,
  question: "meaning" | "reading",
  response: string,
): string | null {
  if (!characters) return null;
  const warnings = ITEM_WARNINGS[normalizeKey(characters)];
  if (!warnings) return null;
  const guess =
    question === "reading"
      ? toHiragana(response.trim(), { convertLongVowelMark: false })
      : response.trim().toLowerCase();
  const match = warnings.find(
    (w) =>
      w.question === question &&
      (question === "reading"
        ? toHiragana(w.answer, { convertLongVowelMark: false }) === guess
        : w.answer.toLowerCase() === guess),
  );
  return match ? match.message : null;
}
