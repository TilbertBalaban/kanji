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

// WaniKani's last level. Level-up stops here, and the level browser/pickers
// share the same bound.
export const MAX_LEVEL = 60;

/** Bucket a stage into the WaniKani display groups (null/0 = not started). */
export function stageGroup(stage: number | null): string {
  if (stage === null || stage === 0) return "locked";
  if (stage < GURU_STAGE) return "apprentice";
  if (stage < 7) return "guru";
  if (stage === 7) return "master";
  if (stage === 8) return "enlightened";
  return "burned";
}

export function isVocabulary(type: string): boolean {
  return type === "vocabulary" || type === "kana_vocabulary";
}

/**
 * Which prompts a review or lesson quiz asks for a subject: meaning always,
 * reading unless radical (and only when there's an accepted reading to type),
 * recall (English → reading) for vocabulary. kana_vocabulary ships no readings
 * — the kana word is its own reading — so it gets no reading prompt (typing the
 * word back is pointless) but still gets recall, graded against its characters
 * (see readingsForRecall in answer-checker). The single source of truth shared
 * by the quiz pages and completeReview, so logged answer counts always match
 * the prompts that were asked.
 */
export function tasksForSubject(subject: {
  type: string;
  readings: Pick<Reading, "acceptedAnswer">[];
}): { reading: boolean; recall: boolean } {
  const hasReading = subject.readings.some((r) => r.acceptedAnswer);
  return {
    reading: subject.type !== "radical" && hasReading,
    recall: isVocabulary(subject.type) && (hasReading || subject.type === "kana_vocabulary"),
  };
}

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

// Burned items are otherwise never reviewed again (nextAvailableAt returns
// null for BURNED_STAGE). To keep them from fading entirely, a lightweight
// "recall check" reuses the normal review UI but doesn't touch srsStage,
// burnedAt, passedAt, or any ReviewLog — see completeReview et al. in
// lib/progression.ts. Correct answers push the next check out 2 months;
// a miss brings it back much sooner.
export const BURNED_RECALL_INTERVAL_DAYS = 60;
export const BURNED_RECALL_RETRY_DAYS = 3;

export function nextBurnedRecallAt(incorrect: number, from: Date = new Date()): Date {
  const days = incorrect === 0 ? BURNED_RECALL_INTERVAL_DAYS : BURNED_RECALL_RETRY_DAYS;
  return new Date(from.getTime() + days * 24 * 3600_000);
}

// Reviews stop accumulating this long after the user's last review/lesson
// activity: anything that would come due later is pushed forward instead,
// so a returning user never faces more than this window's backlog.
export const INACTIVITY_PAUSE_DAYS = 2;

/**
 * How far (ms) to push not-yet-accumulated reviews forward when the user
 * resumes reviewing after more than INACTIVITY_PAUSE_DAYS away, or null while
 * they're still within the window. Items due before lastActivityAt + the
 * window keep their dates (that's the allowed backlog); items due after it
 * shift by the returned amount, preserving their relative spacing — as if the
 * SRS clock paused at the cutoff and resumed at `now`.
 */
export function inactivityShiftMs(lastActivityAt: Date, now: Date = new Date()): number | null {
  const cutoff = lastActivityAt.getTime() + INACTIVITY_PAUSE_DAYS * 24 * 3600_000;
  const shift = now.getTime() - cutoff;
  return shift > 0 ? shift : null;
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
  // Clamp both ends so a bad input can never push a stage outside the model.
  return Math.min(Math.max(currentStage - adjustment, 1), BURNED_STAGE);
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

export function normalizeAnswer(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
const normalize = normalizeAnswer;

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
