import { describe, expect, it } from "vitest";
import * as wanakana from "wanakana";
import { fromCyrillicLayout } from "./keyboard-layout";

describe("fromCyrillicLayout", () => {
  it("maps Ukrainian layout keystrokes to the romaji they were meant to be", () => {
    expect(fromCyrillicLayout("флфкш")).toBe("akari");
    expect(fromCyrillicLayout("нщгвфт")).toBe("youdan");
  });

  it("feeds wanakana so the quiz sees the intended kana", () => {
    expect(wanakana.toKana(fromCyrillicLayout("флфкш"))).toBe("あかり");
    expect(wanakana.toKana(fromCyrillicLayout("лщтифтцф"))).toBe("こんばんわ");
  });

  it("covers the Russian-only keys too", () => {
    expect(fromCyrillicLayout("ыъэ")).toBe("s]'");
  });

  it("preserves case so uppercase romaji still yields katakana", () => {
    expect(fromCyrillicLayout("ЛФТФ")).toBe("KANA");
    expect(wanakana.toKana(fromCyrillicLayout("ЛФТФ"))).toBe("カナ");
  });

  it("leaves latin, kana and the apostrophe untouched", () => {
    expect(fromCyrillicLayout("akari")).toBe("akari");
    expect(fromCyrillicLayout("あかり")).toBe("あかり");
    // wanakana needs a real apostrophe to split ん from a following vowel
    expect(wanakana.toKana(fromCyrillicLayout("лшт'нщгиш"))).toBe("きんようび");
  });

  it("handles a half-converted IME buffer (kana already committed, latest key still Cyrillic)", () => {
    expect(fromCyrillicLayout("あかк")).toBe("あかr");
  });
});
