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
});

describe("normalizeGrammarAnswer", () => {
  it("converts katakana to hiragana", () => {
    expect(normalizeGrammarAnswer("タベル")).toBe(normalizeGrammarAnswer("たべる"));
  });

  it("collapses whitespace and full/half-width forms", () => {
    expect(normalizeGrammarAnswer("ﾀﾞﾒ")).toBe(normalizeGrammarAnswer("だめ"));
  });
});
