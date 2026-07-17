import { describe, expect, it } from "vitest";
import { checkGrammarAnswer, normalizeGrammarAnswer } from "./grammar-answer-checker";

describe("checkGrammarAnswer", () => {
  it("passes an exact kana match", () => {
    expect(checkGrammarAnswer("たべている", ["たべている"])).toEqual({
      action: "pass",
      message: null,
    });
  });

  it("passes when matching any of several accepted variants", () => {
    expect(checkGrammarAnswer("たべてる", ["たべている", "たべてる"])).toEqual({
      action: "pass",
      message: null,
    });
  });

  it("matches katakana against a hiragana accepted answer", () => {
    expect(checkGrammarAnswer("タベテイル", ["たべている"])).toEqual({
      action: "pass",
      message: null,
    });
  });

  it("matches half-width katakana via NFKC normalization", () => {
    expect(checkGrammarAnswer("ﾀﾍﾞﾃｲﾙ", ["たべている"])).toEqual({
      action: "pass",
      message: null,
    });
  });

  it("ignores surrounding and internal whitespace", () => {
    expect(checkGrammarAnswer(" たべて いる ", ["たべている"])).toEqual({
      action: "pass",
      message: null,
    });
  });

  it("retries on empty input without penalizing", () => {
    const verdict = checkGrammarAnswer("   ", ["たべている"]);
    expect(verdict.action).toBe("retry");
    expect(verdict.message).toBeTruthy();
  });

  it("fails a near-miss with no typo tolerance", () => {
    expect(checkGrammarAnswer("たべてる", ["たべている"])).toEqual({
      action: "fail",
      message: null,
    });
  });

  it("fails an unrelated answer", () => {
    expect(checkGrammarAnswer("ねる", ["たべている"])).toEqual({
      action: "fail",
      message: null,
    });
  });

  it("retries with the hint on a meaning-equivalent wrong form", () => {
    const hints = { です: "Could you try a grammar point that is more casual here?" };
    expect(checkGrammarAnswer("です", ["だ"], hints)).toEqual({
      action: "retry",
      message: "Could you try a grammar point that is more casual here?",
    });
  });

  it("normalizes the guess against hint keys (katakana input)", () => {
    const hints = { です: "More casual, please." };
    expect(checkGrammarAnswer("デス", ["だ"], hints)).toEqual({
      action: "retry",
      message: "More casual, please.",
    });
  });

  it("prefers an accepted answer over a matching hint key", () => {
    // If Bunpro data ever lists an accepted form as a hint too, passing wins.
    expect(checkGrammarAnswer("です", ["です"], { です: "hint" })).toEqual({
      action: "pass",
      message: null,
    });
  });

  it("still fails a wrong answer that is not a hint key", () => {
    expect(checkGrammarAnswer("ます", ["だ"], { です: "hint" })).toEqual({
      action: "fail",
      message: null,
    });
  });
});

describe("normalizeGrammarAnswer", () => {
  it("converts katakana to hiragana", () => {
    expect(normalizeGrammarAnswer("タベル")).toBe(normalizeGrammarAnswer("たべる"));
  });

  it("collapses whitespace and full/half-width forms", () => {
    expect(normalizeGrammarAnswer("ﾀﾞﾒ")).toBe(normalizeGrammarAnswer("だめ"));
  });
});
