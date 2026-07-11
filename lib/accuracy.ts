// Per-answer review accuracy, WaniKani-style: correct answers divided by all
// answers submitted, so repeated misses weigh the percentage down. Each log
// row stores its own per-dimension answer counts (in-app reviews record 1
// correct per prompt asked; rows imported from WaniKani carry between-sync
// deltas), so no subject-type inference is needed here.

export interface AccuracyLog {
  meaningCorrectCount: number;
  readingCorrectCount: number;
  recallCorrectCount: number;
  meaningIncorrectCount: number;
  readingIncorrectCount: number;
  recallIncorrectCount: number;
}

export function answerCounts(log: AccuracyLog): { correct: number; total: number } {
  const correct =
    log.meaningCorrectCount + log.readingCorrectCount + log.recallCorrectCount;
  const wrong =
    log.meaningIncorrectCount + log.readingIncorrectCount + log.recallIncorrectCount;
  return { correct, total: correct + wrong };
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
