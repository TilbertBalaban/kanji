// Cloze answer checking for grammar reviews/lesson quizzes. Deliberately
// separate from lib/answer-checker.ts (a WK/Japanese-specific 12-plugin port
// with typo tolerance) — grammar cloze needs exact particle/conjugation
// precision, so there's no Levenshtein tolerance here, just normalization.

export type GrammarVerdict = {
  action: "pass" | "fail" | "retry";
  message: string | null;
};

/**
 * trim + collapse whitespace, full/half-width → NFKC (so a full-width space,
 * half-width katakana, etc. all match), then katakana → hiragana so a kana
 * variant stored in either script still matches.
 */
export function normalizeGrammarAnswer(s: string): string {
  const collapsed = s.trim().normalize("NFKC").replace(/\s+/g, "");
  return collapsed.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/**
 * Grade one cloze answer against a sentence's accepted answers. Exact match
 * only — no typo tolerance, since particle/conjugation precision is the point
 * of a grammar drill. Stateless: the reveal+retype "already missed" flag and
 * the resulting incorrectCount (0 or 1, never accumulating across retries)
 * live on the page, not here.
 */
export function checkGrammarAnswer(
  input: string,
  acceptedAnswers: string[],
): GrammarVerdict {
  const guess = normalizeGrammarAnswer(input);
  if (!guess) return { action: "retry", message: "Type your answer to continue." };

  const isMatch = acceptedAnswers.some((a) => normalizeGrammarAnswer(a) === guess);
  return isMatch
    ? { action: "pass", message: null }
    : { action: "fail", message: null };
}
