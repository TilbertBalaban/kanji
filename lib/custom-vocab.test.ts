import { describe, expect, it } from "vitest";
import { parseCustomVocabInput, splitList, tasksForCustomVocab } from "./custom-vocab";

describe("parseCustomVocabInput", () => {
  it("accepts a kana-only phrase with reading and meanings", () => {
    const input = parseCustomVocabInput({
      characters: " はじめまして ",
      readings: "はじめまして",
      meanings: "nice to meet you, how do you do",
    });
    expect(input).toEqual({
      characters: "はじめまして",
      meanings: ["nice to meet you", "how do you do"],
      readings: ["はじめまして"],
      notes: null,
    });
  });

  it("accepts an empty reading (meaning-only item)", () => {
    const input = parseCustomVocabInput({ characters: "OK", meanings: "okay", readings: "" });
    expect(input).toMatchObject({ readings: [] });
  });

  it("accepts katakana, prolonged marks and middle dots in readings", () => {
    const input = parseCustomVocabInput({
      characters: "コーヒー",
      readings: "コーヒー",
      meanings: "coffee",
    });
    expect(input).toMatchObject({ readings: ["コーヒー"] });
  });

  it("rejects rōmaji readings", () => {
    expect(
      parseCustomVocabInput({ characters: "犬", readings: "inu", meanings: "dog" }),
    ).toMatch(/rōmaji/);
  });

  it("allows kanji in readings", () => {
    expect(
      parseCustomVocabInput({ characters: "犬", readings: "犬", meanings: "dog" }),
    ).toMatchObject({ readings: ["犬"] });
  });

  it("accepts 〜 and [placeholders] in readings", () => {
    expect(
      parseCustomVocabInput({
        characters: "〜にみえます",
        readings: "〜にみえます",
        meanings: "looks like",
      }),
    ).toMatchObject({ readings: ["〜にみえます"] });
    expect(
      parseCustomVocabInput({
        characters: "〜歳です",
        readings: "[years]歳です, [years]さいです",
        meanings: "I am … years old",
      }),
    ).toMatchObject({ readings: ["[years]歳です", "[years]さいです"] });
  });

  it("still rejects rōmaji outside the slots", () => {
    // Nothing but slots isn't a reading.
    expect(
      parseCustomVocabInput({ characters: "〜", readings: "〜", meanings: "and so on" }),
    ).toMatch(/rōmaji/);
    // An unclosed bracket is a typo, not a slot.
    expect(
      parseCustomVocabInput({ characters: "〜歳", readings: "[yearsさい", meanings: "age" }),
    ).toMatch(/rōmaji/);
  });

  it("keeps separators inside a placeholder out of the split", () => {
    expect(splitList("[years, ages]さいです")).toEqual(["[years, ages]さいです"]);
  });

  it("requires characters and at least one meaning", () => {
    expect(parseCustomVocabInput({ meanings: "dog" })).toMatch(/word\/phrase/);
    expect(parseCustomVocabInput({ characters: "犬", meanings: " , " })).toMatch(/meaning/);
    expect(parseCustomVocabInput({})).toMatch(/word\/phrase/);
  });

  it("splits on Japanese separators too", () => {
    expect(splitList("いぬ、イヌ")).toEqual(["いぬ", "イヌ"]);
  });
});

describe("tasksForCustomVocab", () => {
  it("asks reading and recall only when a reading exists", () => {
    expect(tasksForCustomVocab({ readings: ["はじめまして"] })).toEqual({
      reading: true,
      recall: true,
    });
    expect(tasksForCustomVocab({ readings: [] })).toEqual({ reading: false, recall: false });
  });
});
