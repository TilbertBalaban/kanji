import { describe, expect, it } from "vitest";
import { isTranslateLang, japaneseReading, parseTranslateResponse } from "./translate";

describe("parseTranslateResponse", () => {
  it("extracts translation and target romaji for en→ja", () => {
    // Real gtx payload for q="good evening", sl=en, tl=ja, dt=t&dt=rm.
    const raw = [
      [
        ["こんばんは", "good evening", null, null, 10],
        [null, null, "Konbanwa", "ˌɡo͝od ˈēv(ə)niNG"],
      ],
      null,
      "en",
    ];
    expect(parseTranslateResponse(raw)).toEqual({
      translation: "こんばんは",
      sourceRomaji: "ˌɡo͝od ˈēv(ə)niNG",
      targetRomaji: "Konbanwa",
      detectedSource: "en",
    });
  });

  it("extracts source romaji for ja→en", () => {
    // Real gtx payload for q="初めまして", sl=ja, tl=en.
    const raw = [
      [
        ["nice to meet you", "初めまして", null, null, 10],
        [null, null, null, "Hajimemashite"],
      ],
      null,
      "ja",
    ];
    expect(parseTranslateResponse(raw)).toEqual({
      translation: "nice to meet you",
      sourceRomaji: "Hajimemashite",
      targetRomaji: null,
      detectedSource: "ja",
    });
  });

  it("joins multiple translation chunks", () => {
    const raw = [
      [
        ["Hello ", "こんにちは", null, null, 10],
        ["world", "世界", null, null, 10],
        [null, null, null, "Konnichiwa sekai"],
      ],
      null,
      "ja",
    ];
    expect(parseTranslateResponse(raw)?.translation).toBe("Hello world");
  });

  it("returns null for malformed payloads", () => {
    expect(parseTranslateResponse(null)).toBeNull();
    expect(parseTranslateResponse({})).toBeNull();
    expect(parseTranslateResponse([null])).toBeNull();
    expect(parseTranslateResponse([[[null, null, null, "x"]]])).toBeNull(); // no translation text
  });
});

describe("japaneseReading", () => {
  it("uses all-kana words verbatim, ignoring romaji", () => {
    expect(japaneseReading("こんばんは", "Konbanwa")).toBe("こんばんは");
  });

  it("keeps katakana words as katakana", () => {
    expect(japaneseReading("コーヒー", "kōhī")).toBe("コーヒー");
  });

  it("falls back to hiragana from romaji when the word has kanji", () => {
    expect(japaneseReading("初めまして", "Hajimemashite")).toBe("はじめまして");
  });

  it("returns empty string when a kanji word has no romaji", () => {
    expect(japaneseReading("初めまして", null)).toBe("");
  });
});

describe("isTranslateLang", () => {
  it("accepts supported languages only", () => {
    expect(isTranslateLang("ja")).toBe(true);
    expect(isTranslateLang("en")).toBe(true);
    expect(isTranslateLang("uk")).toBe(true);
    expect(isTranslateLang("de")).toBe(false);
    expect(isTranslateLang(null)).toBe(false);
  });
});
