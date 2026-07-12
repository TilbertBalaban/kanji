import { describe, expect, it } from "vitest";
import { evaluateAnswer, toIME, type CheckableSubject } from "./answer-checker";
import type { Meaning, Reading } from "./srs";

const meaning = (text: string, acceptedAnswer = true, primary = false): Meaning => ({
  meaning: text,
  primary,
  acceptedAnswer,
});

const reading = (
  text: string,
  { accepted = true, primary = false, type }: { accepted?: boolean; primary?: boolean; type?: string } = {},
): Reading => ({ reading: text, primary, acceptedAnswer: accepted, type });

const subject = (partial: Partial<CheckableSubject>): CheckableSubject => ({
  type: "vocabulary",
  characters: null,
  meanings: [],
  auxMeanings: [],
  readings: [],
  ...partial,
});

describe("toIME", () => {
  it("renders ん as nn and ー as a dash", () => {
    expect(toIME("せんい")).toBe("senni");
    expect(toIME("ページ")).toBe("pe-ji");
    expect(toIME("きゅう")).toBe("kyuu");
  });
});

describe("evaluateAnswer — reading shakes", () => {
  const kanji = subject({
    type: "kanji",
    characters: "人",
    meanings: [meaning("Person", true, true)],
    readings: [
      reading("にん", { accepted: true, primary: true, type: "onyomi" }),
      reading("じん", { accepted: true, type: "onyomi" }),
      reading("ひと", { accepted: false, type: "kunyomi" }),
    ],
  });

  it("bounces the kun'yomi when the on'yomi is asked", () => {
    const verdict = evaluateAnswer({ questionType: "reading", response: "ひと", subject: kanji });
    expect(verdict).toEqual({
      action: "retry",
      message: "We’re looking for the on’yomi reading.",
    });
  });

  it("passes an accepted alternate reading", () => {
    expect(evaluateAnswer({ questionType: "reading", response: "じん", subject: kanji }).action).toBe(
      "pass",
    );
  });

  it("shows the per-item warning for 〜人 answered じん", () => {
    const vocab = subject({
      characters: "〜人",
      meanings: [meaning("Number Of People", true, true)],
      readings: [reading("にん", { accepted: true, primary: true })],
    });
    const verdict = evaluateAnswer({ questionType: "reading", response: "じん", subject: vocab });
    expect(verdict).toEqual({
      action: "retry",
      message: "That’s possible, but how do you read it when it’s a counter, as in 三人?",
    });
  });

  it("shows the per-item warning for 内 answered ない", () => {
    const vocab = subject({
      characters: "内",
      meanings: [meaning("Inside", true, true)],
      readings: [reading("うち", { accepted: true, primary: true })],
    });
    const verdict = evaluateAnswer({ questionType: "reading", response: "ない", subject: vocab });
    expect(verdict).toEqual({
      action: "retry",
      message: "That’s a rare reading in certain compounds, but it’s a standalone word here.",
    });
  });

  it("bounces a kanji reading given for a vocabulary word", () => {
    const vocab = subject({
      characters: "車",
      meanings: [meaning("Car", true, true)],
      readings: [reading("くるま", { accepted: true, primary: true })],
      related: { kanjiReadings: ["しゃ", "くるま"] },
    });
    const verdict = evaluateAnswer({ questionType: "reading", response: "しゃ", subject: vocab });
    expect(verdict).toEqual({
      action: "retry",
      message: "Oops, we want the vocabulary reading, not the kanji reading.",
    });
  });

  it("bounces the meaning typed into the reading field", () => {
    const vocab = subject({
      characters: "内",
      meanings: [meaning("Inside", true, true)],
      readings: [reading("うち", { accepted: true, primary: true })],
    });
    const verdict = evaluateAnswer({
      questionType: "reading",
      response: "いんしで",
      inputChars: "inside",
      subject: vocab,
    });
    expect(verdict).toEqual({
      action: "retry",
      message: "Oops, we want the reading, not the meaning.",
    });
  });

  it("flags impossible kana as a typo", () => {
    const vocab = subject({
      characters: "下",
      meanings: [meaning("Below", true, true)],
      readings: [reading("した", { accepted: true, primary: true })],
    });
    const verdict = evaluateAnswer({ questionType: "reading", response: "んした", subject: vocab });
    expect(verdict).toEqual({
      action: "retry",
      message: "That looks like a typo. Do you want to retry?",
    });
  });

  it("catches a big kana typed instead of a small one", () => {
    const vocab = subject({
      characters: "九",
      meanings: [meaning("Nine", true, true)],
      readings: [reading("きゅう", { accepted: true, primary: true })],
    });
    const verdict = evaluateAnswer({ questionType: "reading", response: "きゆう", subject: vocab });
    expect(verdict).toEqual({
      action: "retry",
      message: "Watch out for the small ゅ. Try typing “kyuu” for this one.",
    });
  });

  it("catches a missing ん (single n typed)", () => {
    const vocab = subject({
      characters: "繊維",
      meanings: [meaning("Fiber", true, true)],
      readings: [reading("せんい", { accepted: true, primary: true })],
    });
    const verdict = evaluateAnswer({ questionType: "reading", response: "せに", subject: vocab });
    expect(verdict).toEqual({
      action: "retry",
      message: "Don’t forget that ん is typed as “nn”. Try typing “senni”.",
    });
  });

  it("catches one n too many", () => {
    const vocab = subject({
      characters: "繊維",
      meanings: [meaning("Fiber", true, true)],
      readings: [reading("せんい", { accepted: true, primary: true })],
    });
    const verdict = evaluateAnswer({ questionType: "reading", response: "せんに", subject: vocab });
    expect(verdict).toEqual({
      action: "retry",
      message: 'That looks like a typo. Watch out for those "n"s.',
    });
  });

  it("explains how to type the long ー", () => {
    const vocab = subject({
      type: "kana_vocabulary",
      characters: "ページ",
      meanings: [meaning("Page", true, true)],
      readings: [reading("ページ", { accepted: true, primary: true })],
    });
    const verdict = evaluateAnswer({ questionType: "reading", response: "ぺえじ", subject: vocab });
    expect(verdict).toEqual({
      action: "retry",
      message: "Try typing “pe-ji” to get that long ー.",
    });
  });

  it("silently shakes leftover latin in a kana answer", () => {
    const vocab = subject({
      characters: "内",
      meanings: [meaning("Inside", true, true)],
      readings: [reading("うち", { accepted: true, primary: true })],
    });
    const verdict = evaluateAnswer({ questionType: "reading", response: "うchい", subject: vocab });
    expect(verdict).toEqual({ action: "retry", message: null });
  });

  it("silently shakes an empty answer", () => {
    const vocab = subject({ readings: [reading("うち", { accepted: true, primary: true })] });
    expect(evaluateAnswer({ questionType: "reading", response: "  ", subject: vocab })).toEqual({
      action: "retry",
      message: null,
    });
  });
});

describe("evaluateAnswer — meaning shakes", () => {
  const vocab = subject({
    characters: "車",
    meanings: [meaning("Car", true, true)],
    readings: [reading("くるま", { accepted: true, primary: true })],
  });

  it("bounces the reading typed as romaji into the meaning field", () => {
    const verdict = evaluateAnswer({ questionType: "meaning", response: "kuruma", subject: vocab });
    expect(verdict).toEqual({
      action: "retry",
      message: "Oops, we want the meaning, not the reading.",
    });
  });

  it("silently shakes kana typed into the meaning field", () => {
    const verdict = evaluateAnswer({ questionType: "meaning", response: "くるま", subject: vocab });
    expect(verdict).toEqual({ action: "retry", message: null });
  });

  it("bounces a kanji meaning given for a radical", () => {
    const radical = subject({
      type: "radical",
      characters: "又",
      meanings: [meaning("Stool", true, true)],
      related: { kanjiMeanings: ["Again"] },
    });
    const verdict = evaluateAnswer({ questionType: "meaning", response: "again", subject: radical });
    expect(verdict).toEqual({
      action: "retry",
      message: "Oops, we want the radical meaning, not the kanji meaning.",
    });
  });

  it("bounces a vocabulary meaning given for a kanji", () => {
    const kanji = subject({
      type: "kanji",
      characters: "先",
      meanings: [meaning("Previous", true, true)],
      related: { radicalMeanings: [], vocabularyMeanings: ["Tip", "Ahead"] },
    });
    const verdict = evaluateAnswer({ questionType: "meaning", response: "tip", subject: kanji });
    expect(verdict).toEqual({
      action: "retry",
      message: "Oops, we want the kanji meaning, not the vocabulary meaning.",
    });
  });

  it("asks verbs to be typed with their to-prefix", () => {
    const verb = subject({
      characters: "上げる",
      meanings: [meaning("To Raise", true, true)],
      readings: [reading("あげる", { accepted: true, primary: true })],
    });
    const verdict = evaluateAnswer({ questionType: "meaning", response: "raise", subject: verb });
    expect(verdict).toEqual({
      action: "retry",
      message: "Almost! It ends in る, so it’s a verb. Please type “To Raise”.",
    });
  });

  it("rejects a to-prefix on kanji meanings", () => {
    const kanji = subject({
      type: "kanji",
      characters: "行",
      meanings: [meaning("Go", true, true)],
    });
    const verdict = evaluateAnswer({ questionType: "meaning", response: "to go", subject: kanji });
    expect(verdict).toEqual({
      action: "retry",
      message: 'This is a kanji, so it doesn’t start with "to".',
    });
  });

  it("silently shakes when the item's own characters are typed back", () => {
    const verdict = evaluateAnswer({ questionType: "meaning", response: "車", subject: vocab });
    expect(verdict).toEqual({ action: "retry", message: null });
  });
});

describe("evaluateAnswer — info messages", () => {
  it("warns when a passing answer had a typo", () => {
    const vocab = subject({
      characters: "内",
      meanings: [meaning("Inside", true, true)],
    });
    const verdict = evaluateAnswer({ questionType: "meaning", response: "insde", subject: vocab });
    expect(verdict).toEqual({
      action: "pass",
      message: "Your answer was a bit off. Check the meaning to make sure you are correct.",
    });
  });

  it("mentions multiple possible meanings on an exact match", () => {
    const vocab = subject({
      meanings: [meaning("Inside", true, true), meaning("Within")],
    });
    const verdict = evaluateAnswer({ questionType: "meaning", response: "within", subject: vocab });
    expect(verdict).toEqual({
      action: "pass",
      message: "Did you know this item has multiple possible meanings?",
    });
  });

  it("offers the mnemonic on a plain miss", () => {
    const vocab = subject({
      meanings: [meaning("Inside", true, true)],
    });
    const verdict = evaluateAnswer({ questionType: "meaning", response: "banana", subject: vocab });
    expect(verdict).toEqual({
      action: "fail",
      message: "Need help? View the correct meaning and mnemonic.",
    });
  });

  it("stays quiet when the only extra reading is a kana variant", () => {
    const vocab = subject({
      characters: "ビー玉",
      meanings: [meaning("Marble", true, true)],
      readings: [reading("びーだま", { primary: true }), reading("ビーだま")],
    });
    expect(evaluateAnswer({ questionType: "reading", response: "びーだま", subject: vocab })).toEqual({
      action: "pass",
      message: null,
    });
  });

  it("mentions multiple possible readings when they are genuinely distinct", () => {
    const kanji = subject({
      type: "kanji",
      characters: "人",
      meanings: [meaning("Person", true, true)],
      readings: [
        reading("にん", { primary: true, type: "onyomi" }),
        reading("じん", { type: "onyomi" }),
      ],
    });
    expect(evaluateAnswer({ questionType: "reading", response: "にん", subject: kanji })).toEqual({
      action: "pass",
      message: "Did you know this item has multiple possible readings?",
    });
  });

  it("stays quiet on an exact single-answer match", () => {
    const vocab = subject({
      meanings: [meaning("Inside", true, true)],
    });
    expect(evaluateAnswer({ questionType: "meaning", response: "Inside", subject: vocab })).toEqual({
      action: "pass",
      message: null,
    });
  });
});
