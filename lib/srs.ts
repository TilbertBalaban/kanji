// SRS stage model (WaniKani-style):
// 0 = initiate (lesson not yet taken)
// 1-4 = Apprentice 1-4, 5-6 = Guru 1-2, 7 = Master, 8 = Enlightened, 9 = Burned

export const STAGE_NAMES: Record<number, string> = {
  0: "Initiate",
  1: "Apprentice I",
  2: "Apprentice II",
  3: "Apprentice III",
  4: "Apprentice IV",
  5: "Guru I",
  6: "Guru II",
  7: "Master",
  8: "Enlightened",
  9: "Burned",
};

export const GURU_STAGE = 5;
export const BURNED_STAGE = 9;

// Hours until next review after reaching a stage. One hour is shaved off
// day-multiple intervals so reviews stay available at the same time of day.
const STAGE_INTERVAL_HOURS: Record<number, number> = {
  1: 4,
  2: 8,
  3: 23,
  4: 47,
  5: 167, // ~1 week
  6: 335, // ~2 weeks
  7: 719, // ~1 month
  8: 2879, // ~4 months
};

export function nextAvailableAt(stage: number, from: Date = new Date()): Date | null {
  const hours = STAGE_INTERVAL_HOURS[stage];
  if (hours === undefined) return null; // burned (or initiate) — never reviewed again
  return new Date(from.getTime() + hours * 3600_000);
}

/**
 * Stage transition after a completed review of one subject.
 * incorrectCount is the total wrong attempts across meaning + reading.
 * Penalty is doubled once an item is Guru or above.
 */
export function nextStage(currentStage: number, incorrectCount: number): number {
  if (incorrectCount === 0) return Math.min(currentStage + 1, BURNED_STAGE);
  const penaltyFactor = currentStage >= GURU_STAGE ? 2 : 1;
  const adjustment = Math.ceil(incorrectCount / 2) * penaltyFactor;
  return Math.max(currentStage - adjustment, 1);
}

// ---------- Answer checking ----------

export interface Meaning {
  meaning: string;
  primary: boolean;
  acceptedAnswer: boolean;
}

export interface AuxMeaning {
  meaning: string;
  type: "whitelist" | "blacklist";
}

export interface Reading {
  reading: string;
  primary: boolean;
  acceptedAnswer: boolean;
  type?: string; // onyomi | kunyomi | nanori for kanji
}

export type AnswerResult = "correct" | "incorrect" | "retry"; // retry = not counted (e.g. wrong reading type)

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[n];
}

/** Typo tolerance grows with answer length, like WaniKani's. */
function tolerance(len: number): number {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 8) return 2;
  return 3;
}

export function checkMeaning(
  input: string,
  meanings: Meaning[],
  auxMeanings: AuxMeaning[] = [],
  userSynonyms: string[] = [],
): AnswerResult {
  const guess = normalize(input);
  if (!guess) return "retry";

  // User synonyms are explicitly added by the user, so they win over the
  // blacklist if the two ever overlap.
  const synonyms = userSynonyms.map(normalize);
  if (synonyms.includes(guess)) return "correct";

  for (const aux of auxMeanings) {
    if (aux.type === "blacklist" && normalize(aux.meaning) === guess) return "incorrect";
  }

  const accepted = [
    ...meanings.filter((m) => m.acceptedAnswer).map((m) => m.meaning),
    ...auxMeanings.filter((a) => a.type === "whitelist").map((a) => a.meaning),
    ...userSynonyms,
  ];

  for (const answer of accepted) {
    const target = normalize(answer);
    if (levenshtein(guess, target) <= tolerance(target.length)) return "correct";
  }
  return "incorrect";
}

/** Katakana → hiragana so on'yomi shown in katakana still match typed hiragana. */
function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

/**
 * Readings must match exactly (no typo tolerance).
 * For kanji, answering with a real-but-not-requested reading type (e.g. kunyomi
 * when the primary is onyomi) returns "retry": shake the input, don't penalize.
 */
export function checkReading(input: string, readings: Reading[]): AnswerResult {
  const guess = toHiragana(normalize(input));
  if (!guess) return "retry";

  const isMatch = (r: Reading) => toHiragana(r.reading) === guess;

  if (readings.filter((r) => r.acceptedAnswer).some(isMatch)) return "correct";
  if (readings.some(isMatch)) return "retry";
  return "incorrect";
}
