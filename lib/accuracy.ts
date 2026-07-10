// Per-answer review accuracy. Each review log contributes one answer per
// prompt type (meaning, reading unless radical, recall for vocabulary) plus
// its wrong attempts, so repeated misses weigh the percentage down.

export interface AccuracyLog {
  meaningIncorrectCount: number;
  readingIncorrectCount: number;
  recallIncorrectCount: number;
  subject: { type: string };
}

export function answerCounts(log: AccuracyLog): { correct: number; total: number } {
  const isVocab =
    log.subject.type === "vocabulary" || log.subject.type === "kana_vocabulary";
  const answers = 1 + (log.subject.type !== "radical" ? 1 : 0) + (isVocab ? 1 : 0);
  const wrong =
    log.meaningIncorrectCount + log.readingIncorrectCount + log.recallIncorrectCount;
  return { correct: answers, total: answers + wrong };
}

// Fraction of answers correct across the given logs, or null with no data.
export function reviewAccuracy(logs: AccuracyLog[]): number | null {
  let correct = 0;
  let total = 0;
  for (const log of logs) {
    const c = answerCounts(log);
    correct += c.correct;
    total += c.total;
  }
  return total ? correct / total : null;
}
