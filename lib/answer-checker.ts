// Port of WaniKani's real answer checker (assets.wanikani.com lib/answer_checker),
// layered on top of the app's pass/fail scoring in srs.ts. Beyond correct/incorrect
// it produces WaniKani's "shake" retries — plausible-but-not-asked-for answers that
// are bounced back with a hint instead of being marked wrong — plus the follow-up
// info messages shown after an answer is graded.
//
// Message texts are verbatim from WaniKani, except the wrong-reading-type one,
// which says "We're looking for…" instead of "WaniKani is looking for…", and the
// "multiple possible meanings/readings" one, which also lists the alternates so
// they're visible without opening the item info panel.

import { toHiragana as wkToHiragana, toRomaji, stripOkurigana } from "wanakana";
import {
  checkMeaning,
  checkReading,
  normalizeAnswer,
  type AuxMeaning,
  type Meaning,
  type Reading,
} from "./srs";
import { itemWarningFor } from "./item-warnings";

export type QuestionType = "meaning" | "reading";
export type AnswerAction = "pass" | "fail" | "retry";

export interface AnswerVerdict {
  action: AnswerAction;
  /**
   * For "retry": the shake-bubble hint (null = silent shake).
   * For "pass"/"fail": an optional follow-up info line ("Your answer was a bit
   * off…", "Need help?…").
   */
  message: string | null;
}

/**
 * Meanings/readings of *identical-character* subjects of the other types
 * (radical 又 vs kanji 又, kanji 人 vs vocab 〜人, …), used for the
 * "Oops, we want the X, not the Y." shakes. Built server-side by
 * lib/related-answers.ts and shipped with quiz subjects.
 */
export interface RelatedAnswers {
  radicalMeanings?: string[];
  kanjiMeanings?: string[];
  kanjiReadings?: string[];
  vocabularyMeanings?: string[];
  /**
   * Other vocabulary sharing an accepted meaning with this subject
   * (父 ↔ お父さん ↔ 父親 for "father"), for the recall shake — on an
   * English → reading prompt, the reading of a different word with the same
   * meaning is a fair guess, not a mistake.
   */
  sameMeaningVocab?: { characters: string; readings: string[] }[];
}

export interface CheckableSubject {
  type: string; // "radical" | "kanji" | "vocabulary" | "kana_vocabulary"
  characters: string | null;
  meanings: Meaning[];
  auxMeanings: AuxMeaning[];
  readings: Reading[];
  related?: RelatedAnswers;
}

export interface AnswerCheckArgs {
  questionType: QuestionType; // recall prompts check as "reading"
  /** True for recall prompts (English → reading), which check as "reading". */
  recall?: boolean;
  /** What is in the input field (kana for reading questions). */
  response: string;
  /** Raw keystrokes before kana conversion (reading questions only). */
  inputChars?: string;
  subject: CheckableSubject;
  userSynonyms?: string[];
}

// ---------- shared kana helpers ----------

const toHiragana = (s: string) => wkToHiragana(s, { convertLongVowelMark: false });

// Kana, plus the wave dash a custom-vocab pattern reading is written with
// (〜にみえます) — typing it back is a fair answer, not a script mismatch.
const KANA_ONLY = /^[぀-ゟ゠-ヿ〜～]+$/;

function visibleMeanings(subject: CheckableSubject): string[] {
  return subject.meanings.filter((m) => m.acceptedAnswer).map((m) => m.meaning);
}

function visibleReadings(subject: CheckableSubject): string[] {
  return subject.readings.filter((r) => r.acceptedAnswer).map((r) => r.reading);
}

/**
 * Readings to grade a reading/recall answer against. kana_vocabulary ships no
 * readings — the kana word itself is the reading — so a recall prompt (English
 * → the word) is checked against its characters.
 */
function readingsForRecall(subject: CheckableSubject): Reading[] {
  if (subject.readings.some((r) => r.acceptedAnswer)) return subject.readings;
  if (subject.type === "kana_vocabulary" && subject.characters) {
    return [{ reading: subject.characters, primary: true, acceptedAnswer: true }];
  }
  return subject.readings;
}

// WaniKani's toIME: kana → the romaji keystrokes that produce it (ん = "nn").
const SMALL_KANA_SUFFIX = ["ゃ", "ゅ", "ょ", "ャ", "ュ", "ョ"];
const SMALL_KANA_PREFIX = ["っ", "ッ"];

function splitIntoMorae(kana: string): string[] {
  const morae: string[] = [];
  for (let i = 0; i < kana.length; i += 1) {
    const isCompoundPrefix = SMALL_KANA_PREFIX.includes(kana[i]);
    const isCompoundSuffix = SMALL_KANA_SUFFIX.includes(kana[i + 1]);
    const isSurrounded = isCompoundPrefix && SMALL_KANA_SUFFIX.includes(kana[i + 2]);
    if (isSurrounded) {
      morae.push(kana[i] + kana[i + 1] + kana[i + 2]);
      i += 2;
    } else if (isCompoundPrefix || isCompoundSuffix) {
      morae.push(kana[i] + kana[i + 1]);
      i += 1;
    } else {
      morae.push(kana[i]);
    }
  }
  return morae;
}

export function toIME(kana: string): string {
  return splitIntoMorae(kana)
    .map((mora) => {
      if (mora === "ん" || mora === "ン") return "nn";
      if (mora === "ー") return "-";
      return toRomaji(mora);
    })
    .join("");
}

// ---------- plugins (in WaniKani's evaluation order) ----------

type PluginResult = AnswerVerdict | null;

interface PluginArgs extends AnswerCheckArgs {
  passed: boolean;
  userSynonyms: string[];
}

// 1. Impossible kana sequences are typos, not mistakes.
function checkImpossibleKana({ questionType, response, passed }: PluginArgs): PluginResult {
  if (passed || questionType !== "reading") return null;
  const impossible =
    /^[んゃゅょぁぃぅぇぉっゎンャュョァィゥェォヵヶッヮ]/.test(response) ||
    response.search(/(んん|ンン)/) !== -1 ||
    /[んゃゅょぁぃぅぇぉンャュョァィゥェォ][ゃゅょぁぃぅぇぉャュョァィゥェォ]/.test(response) ||
    response.search(/[っッ][あいうえおゃゅょぁぃぅぇぉアイウエオャュョァィゥェォ]/) !== -1 ||
    response.search(/[^きしちにひみりぎじぢびぴキシチニヒミリギジヂビピ][ゃゅょャュョ]/) !== -1;
  if (impossible) {
    return { action: "retry", message: "That looks like a typo. Do you want to retry?" };
  }
  return null;
}

// 2. Kanji answered with a real reading of the wrong type (kun'yomi for on'yomi…).
const READING_TYPE_LABELS: Record<string, string> = {
  onyomi: "on’yomi",
  kunyomi: "kun’yomi",
  nanori: "nanori",
};

function checkKanjiReadings({ questionType, response, subject, passed }: PluginArgs): PluginResult {
  if (passed || questionType !== "reading" || subject.type !== "kanji") return null;
  const primaryType = subject.readings.find((r) => r.primary)?.type;
  if (!primaryType) return null;
  const guess = toHiragana(response);
  const alternate = subject.readings.find(
    (r) => r.type !== primaryType && toHiragana(r.reading) === guess,
  );
  if (alternate) {
    return {
      action: "retry",
      message: `We’re looking for the ${READING_TYPE_LABELS[primaryType] ?? primaryType} reading.`,
    };
  }
  return null;
}

// 3. Per-item warning list — hand-written messages for specific wrong answers.
function checkWarningList({ questionType, response, subject }: PluginArgs): PluginResult {
  const message = itemWarningFor(subject.characters, questionType, response);
  if (message) return { action: "retry", message };
  return null;
}

// 4. Recall (English → reading) answered with a *different* word that shares
// the meaning (prompt "father", card お父さん, answer ちち) — a fair guess,
// so shake it back instead of failing.
function checkSameMeaningVocab({
  questionType,
  recall,
  response,
  subject,
  passed,
}: PluginArgs): PluginResult {
  if (passed || !recall || questionType !== "reading") return null;
  const guess = toHiragana(response.trim());
  const match = subject.related?.sameMeaningVocab?.find((v) =>
    v.readings.some((r) => toHiragana(r) === guess),
  );
  if (match) {
    return {
      action: "retry",
      message: `Oops, that’s ${match.characters} — a different word with the same meaning.`,
    };
  }
  return null;
}

// 5. Right answer, wrong field: reading typed into meaning or vice versa.
const missingNRegEx = /[^n]n$/g;
const addMissingNs = (response: string) =>
  response.replaceAll(missingNRegEx, (match) => match.replace("n", "nn"));

function isIMEEquivalent(kana: string, response: string): boolean {
  return wkToHiragana(kana) === wkToHiragana(addMissingNs(response), { IMEMode: true });
}

function checkTransliterated({
  questionType,
  response,
  inputChars,
  subject,
  userSynonyms,
  passed,
}: PluginArgs): PluginResult {
  if (passed) return null;

  if (
    questionType === "meaning" &&
    visibleReadings(subject).some((reading) => isIMEEquivalent(reading, response))
  ) {
    return { action: "retry", message: "Oops, we want the meaning, not the reading." };
  }

  if (questionType === "reading" && inputChars) {
    const normalizedChars = inputChars.trim().toLowerCase();
    const meanings = visibleMeanings(subject).concat(userSynonyms);
    if (normalizedChars && meanings.some((text) => normalizedChars === text.toLowerCase())) {
      return { action: "retry", message: "Oops, we want the reading, not the meaning." };
    }
  }
  return null;
}

// 6. Answered with the identical-character subject of another type.
function checkRelatedMeaningsAndReadings({
  questionType,
  response,
  subject,
}: PluginArgs): PluginResult {
  const related = subject.related;
  if (!related) return null;

  const matchesMeaning = (list?: string[]) =>
    Boolean(list?.some((m) => normalizeAnswer(m) === normalizeAnswer(response)));

  if (questionType === "meaning") {
    if (subject.type === "radical" && matchesMeaning(related.kanjiMeanings)) {
      return { action: "retry", message: "Oops, we want the radical meaning, not the kanji meaning." };
    }
    if (subject.type === "kanji") {
      if (matchesMeaning(related.radicalMeanings)) {
        return { action: "retry", message: "Oops, we want the kanji meaning, not the radical meaning." };
      }
      if (matchesMeaning(related.vocabularyMeanings)) {
        return { action: "retry", message: "Oops, we want the kanji meaning, not the vocabulary meaning." };
      }
    }
    if (subject.type === "vocabulary" && matchesMeaning(related.kanjiMeanings)) {
      return { action: "retry", message: "Oops, we want the vocabulary meaning, not the kanji meaning." };
    }
  } else if (subject.type === "vocabulary" && related.kanjiReadings) {
    const guess = toHiragana(response.trim());
    if (related.kanjiReadings.some((r) => toHiragana(r) === guess)) {
      return { action: "retry", message: "Oops, we want the vocabulary reading, not the kanji reading." };
    }
  }
  return null;
}

// 7. Typed the prompt's own characters back — silent shake.
function checkKanji({ response, subject }: PluginArgs): PluginResult {
  if (subject.characters !== null && subject.characters === response) {
    return { action: "retry", message: null };
  }
  return null;
}

// 8. Long katakana vowel mark ー typed as the vowel it sounds like.
const soundAlikes: Record<string, string> = { お: "う", う: "お", え: "い" };

function getEndingVowel(mora: string): string {
  const romaji = toRomaji(mora);
  return romaji[romaji.length - 1];
}

function convertDashesToVowels(kana: string): string {
  let newKana = "";
  for (let i = 0; i < kana.length; i++) {
    newKana += kana[i] === "ー" ? toHiragana(getEndingVowel(kana[i - 1])) : toHiragana(kana[i]);
  }
  return newKana;
}

function longDashMatches(reading: string, response: string): boolean {
  const convertedReading = convertDashesToVowels(reading);
  const normalizedResponse = toHiragana(response);
  if (convertedReading.length !== normalizedResponse.length) return false;
  return convertedReading.split("").every((character, i) => {
    if (character === normalizedResponse[i]) return true;
    const soundsAlike = soundAlikes[character] === normalizedResponse[i];
    const replacesADash = reading[i] === "ー";
    const notReplacingAVowel = !(reading[i - 1] in soundAlikes);
    return soundsAlike && replacesADash && notReplacingAVowel;
  });
}

function checkLongDash({ questionType, response, subject }: PluginArgs): PluginResult {
  if (questionType !== "reading") return null;
  const reading = visibleReadings(subject).find(
    (r) => r.includes("ー") && longDashMatches(r, response),
  );
  if (reading) {
    return { action: "retry", message: `Try typing “${toIME(reading)}” to get that long ー.` };
  }
  return null;
}

// 9. Verb meaning given without its "to " — bounce with the full form.
function checkThatVerbStartsWithTo({
  questionType,
  response,
  subject,
  passed,
}: PluginArgs): PluginResult {
  if (passed || questionType !== "meaning") return null;
  const lower = response.toLowerCase();
  const meanings = visibleMeanings(subject);
  if (lower.startsWith("to ") || !meanings.some((m) => m.toLowerCase().startsWith("to "))) {
    return null;
  }
  const matched = meanings.find((m) => {
    const normalized = m.toLowerCase();
    return normalized.startsWith("to ") && normalized.replace("to ", "") === lower;
  });
  if (matched && subject.characters) {
    const okurigana =
      subject.characters.replace(stripOkurigana(subject.characters), "") || subject.characters;
    return {
      action: "retry",
      message: `Almost! It ends in ${okurigana[okurigana.length - 1]}, so it’s a verb. Please type “${matched}”.`,
    };
  }
  return null;
}

// 10. Big kana typed where a small ゃゅょ was expected.
const smallPairs: Record<string, string> = {
  ゃ: "や",
  ゅ: "ゆ",
  ょ: "よ",
  ャ: "ヤ",
  ュ: "ユ",
  ョ: "ヨ",
};

function joinWordsNicely(words: string[]): string {
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function smallKanaCorrections(response: string, expected: string) {
  if (response.length !== expected.length) return null;
  const corrections: { expectedChar: string; expectedAnswer: string }[] = [];
  for (let i = 0; i < response.length; i += 1) {
    const userChar = response[i];
    const expectedChar = expected[i];
    if (userChar === smallPairs[expectedChar]) {
      corrections.push({ expectedChar, expectedAnswer: expected });
    } else if (userChar !== expectedChar) {
      return null;
    }
  }
  return corrections;
}

function checkSmallHiragana({ questionType, response, subject }: PluginArgs): PluginResult {
  if (questionType !== "reading") return null;
  for (const reading of visibleReadings(subject)) {
    const corrections = smallKanaCorrections(response, reading);
    if (corrections && corrections.length > 0) {
      const smallCharacters = corrections.map(({ expectedChar }) => expectedChar);
      return {
        action: "retry",
        message: `Watch out for the small ${joinWordsNicely(smallCharacters)}. Try typing “${toIME(corrections[0].expectedAnswer)}” for this one.`,
      };
    }
  }
  return null;
}

// 11. ん typo detection — a single "n" where "nn" was needed, or one too many.
const customRomajiMapping = { ぢ: "di", づ: "du", ぢゃ: "dya", ぢゅ: "dyu", ぢょ: "dyo", ふ: "hu" };
const toRomajiCustom = (kana: string) => toRomaji(kana, { customRomajiMapping });

const toRomajiMora = (kana: string): string[] =>
  kana.split("").map((mora) => (mora === "っ" ? "*" : toRomajiCustom(mora)));

const identicalArrays = (a: string[], b: string[]) =>
  a.length === b.length && a.every((element, index) => element === b[index]);

const cloneAndSplice = (array: string[], start: number, deleteCount: number, ...items: string[]) => {
  const clone = array.slice();
  clone.splice(start, deleteCount, ...items);
  return clone;
};

function createMissingNPermutations(permutations: string[][], startIndex = 0): string[][] {
  const moras = permutations[permutations.length - 1];
  const pushAndRecurse = (newMoras: string[], nextIndex = 0) => {
    permutations.push(newMoras);
    createMissingNPermutations(permutations, nextIndex);
  };
  moras.forEach((mora, index) => {
    if (!mora.startsWith("n") || index < startIndex) return;
    const nextChar = moras[index + 1];
    if (mora === "n") {
      if (nextChar && /^[aeiou]$/.test(nextChar)) {
        pushAndRecurse(cloneAndSplice(moras, index + 1, 1, `n${nextChar}`));
      }
      if (nextChar && /^(ya|yu|yo)$/.test(nextChar)) {
        pushAndRecurse(cloneAndSplice(moras, index + 1, 0, "ni"));
      }
    }
    if (/^n[aeiou]$/.test(mora) && index > 0 && moras[index - 1] !== "n") {
      pushAndRecurse(cloneAndSplice(moras, index, 1, "n", mora.charAt(1)), index + 1);
      if (mora === "ni" && nextChar && /^(ya|yu|yo)$/.test(nextChar)) {
        pushAndRecurse(cloneAndSplice(moras, index, 1, "n"), index + 1);
      }
    }
  });
  return permutations;
}

function createTooManyNPermutations(permutations: string[][], startIndex = 0): string[][] {
  const moras = permutations[permutations.length - 1];
  const pushAndRecurse = (newMoras: string[], nextIndex = 0) => {
    permutations.push(newMoras);
    createTooManyNPermutations(permutations, nextIndex);
  };
  moras.forEach((mora, index) => {
    if (mora !== "n" || index < startIndex) return;
    const nextChar = moras[index + 1];
    if (nextChar && /^n[aeou]$/.test(nextChar)) {
      pushAndRecurse(cloneAndSplice(moras, index + 1, 1, nextChar.charAt(1)), index + 1);
    }
    if (nextChar === "ni") {
      const nextNextChar = moras[index + 2];
      if (/^(ya|yu|yo)$/.test(nextNextChar)) {
        pushAndRecurse(cloneAndSplice(moras, index + 1, 1), index + 1);
      } else {
        pushAndRecurse(cloneAndSplice(moras, index + 1, 1, nextChar.charAt(1)), index + 1);
      }
    }
  });
  return permutations;
}

const findMatchingIndexInArrayOfArrays = (a: string[][], b: string[][]) =>
  a.findIndex((arrayA) => b.some((arrayB) => identicalArrays(arrayA, arrayB)));

function checkN({ questionType, response, subject }: PluginArgs): PluginResult {
  if (questionType !== "reading") return null;
  const readingsContainingN = visibleReadings(subject).filter((text) => text.includes("ん"));
  if (readingsContainingN.length === 0) return null;

  const readingMora = readingsContainingN.map(toRomajiMora);
  const responseMora = toRomajiMora(response);
  if (findMatchingIndexInArrayOfArrays(readingMora, [responseMora]) !== -1) return null;

  const tooFewIndex = findMatchingIndexInArrayOfArrays(
    readingMora,
    createMissingNPermutations([responseMora.slice()]),
  );
  if (tooFewIndex !== -1) {
    return {
      action: "retry",
      message: `Don’t forget that ん is typed as “nn”. Try typing “${toIME(readingsContainingN[tooFewIndex])}”.`,
    };
  }

  const tooManyIndex = findMatchingIndexInArrayOfArrays(
    readingMora,
    createTooManyNPermutations([responseMora.slice()]),
  );
  if (tooManyIndex !== -1) {
    return { action: "retry", message: 'That looks like a typo. Watch out for those "n"s.' };
  }
  return null;
}

// 12. Kanji meaning given with a "to " prefix it can't have.
function checkKanjiDoesNotStartWithTo({
  questionType,
  response,
  subject,
  passed,
}: PluginArgs): PluginResult {
  if (passed || questionType !== "meaning" || subject.type !== "kanji") return null;
  const lower = response.toLowerCase();
  if (!lower.startsWith("to ")) return null;
  const modifiedResponse = lower.substring(3);
  if (visibleMeanings(subject).some((meaning) => modifiedResponse === meaning.toLowerCase())) {
    return { action: "retry", message: 'This is a kanji, so it doesn’t start with "to".' };
  }
  return null;
}

const PLUGINS = [
  checkImpossibleKana,
  checkKanjiReadings,
  checkWarningList,
  checkSameMeaningVocab,
  checkTransliterated,
  checkRelatedMeaningsAndReadings,
  checkKanji,
  checkLongDash,
  checkThatVerbStartsWithTo,
  checkSmallHiragana,
  checkN,
  checkKanjiDoesNotStartWithTo,
];

// ---------- entry point ----------

export function evaluateAnswer({
  questionType,
  recall = false,
  response,
  inputChars,
  subject,
  userSynonyms = [],
}: AnswerCheckArgs): AnswerVerdict {
  const trimmed = response.trim();
  if (!trimmed) return { action: "retry", message: null };

  // WaniKani refuses to even grade an answer whose script doesn't match the
  // question — silent shake. (Reading answers may carry a trailing pending "n".)
  if (questionType === "reading") {
    const withoutTrailingN = trimmed.endsWith("n") ? trimmed.slice(0, -1) : trimmed;
    if (withoutTrailingN && !KANA_ONLY.test(withoutTrailingN)) {
      return { action: "retry", message: null };
    }
  } else if (/[぀-ゟ゠-ヿ]/.test(trimmed)) {
    return { action: "retry", message: null };
  }

  const result =
    questionType === "meaning"
      ? checkMeaning(response, subject.meanings, subject.auxMeanings, userSynonyms)
      : checkReading(response, readingsForRecall(subject));

  const blocked =
    questionType === "meaning" &&
    result === "incorrect" &&
    subject.auxMeanings.some(
      (aux) => aux.type === "blacklist" && normalizeAnswer(aux.meaning) === normalizeAnswer(response),
    );

  // Exact reading matches come back as "correct"; srs.ts's own "retry" (a real
  // but unrequested reading) is re-derived below with a proper message.
  const accurate =
    questionType === "reading"
      ? result === "correct"
      : subject.meanings.some(
          (m) => m.acceptedAnswer && normalizeAnswer(m.meaning) === normalizeAnswer(response),
        ) ||
        subject.auxMeanings.some(
          (a) => a.type === "whitelist" && normalizeAnswer(a.meaning) === normalizeAnswer(response),
        ) ||
        userSynonyms.some((s) => normalizeAnswer(s) === normalizeAnswer(response));

  const passed = result === "correct";

  if (!accurate && !blocked) {
    const args: PluginArgs = { questionType, recall, response: trimmed, inputChars, subject, userSynonyms, passed };
    for (const plugin of PLUGINS) {
      const verdict = plugin(args);
      if (verdict) return verdict;
    }
    // A real-but-unlisted alternate reading (srs.ts "retry") with no richer
    // message above still shakes rather than failing.
    if (result === "retry") {
      return { action: "retry", message: "That reading is possible, but it’s not the one we’re looking for." };
    }
  }

  const action: AnswerAction = passed ? "pass" : "fail";
  return {
    action,
    message: itemInfoMessage({ questionType, accurate, passed, subject, response: trimmed }),
  };
}

function itemInfoMessage({
  questionType,
  accurate,
  passed,
  subject,
  response,
}: {
  questionType: QuestionType;
  accurate: boolean;
  passed: boolean;
  subject: CheckableSubject;
  response: string;
}): string | null {
  if (!passed) {
    return `Need help? View the correct ${questionType} and mnemonic.`;
  }
  // Kana-variant duplicates (びーだま/ビーだま) are one reading, not two.
  const multipleAnswers =
    questionType === "meaning"
      ? visibleMeanings(subject).length > 1
      : new Set(visibleReadings(subject).map(toHiragana)).size > 1;
  if (accurate && multipleAnswers) {
    const question = `Did you know this item has multiple possible ${questionType}s?`;
    const others =
      questionType === "meaning"
        ? visibleMeanings(subject).filter(
            (m) => normalizeAnswer(m) !== normalizeAnswer(response),
          )
        : [
            ...new Map(visibleReadings(subject).map((r) => [toHiragana(r), r])).values(),
          ].filter((r) => toHiragana(r) !== toHiragana(response));
    if (others.length === 0) return question;
    return questionType === "meaning"
      ? `${question} It also means: ${others.join(", ")}.`
      : `${question} It can also be read: ${others.join(", ")}.`;
  }
  if (!accurate) {
    return `Your answer was a bit off. Check the ${questionType} to make sure you are correct.`;
  }
  return null;
}
