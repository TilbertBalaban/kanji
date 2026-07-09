import { describe, expect, it } from "vitest";
import {
  checkMeaning,
  checkReading,
  nextAvailableAt,
  nextStage,
  type AuxMeaning,
  type Meaning,
  type Reading,
} from "./srs";

describe("nextStage", () => {
  it("advances one stage on a correct answer", () => {
    expect(nextStage(1, 0)).toBe(2);
    expect(nextStage(4, 0)).toBe(5);
    expect(nextStage(8, 0)).toBe(9);
  });

  it("caps at burned", () => {
    expect(nextStage(9, 0)).toBe(9);
  });

  it("drops 1 step per 2 wrong attempts below Guru", () => {
    expect(nextStage(4, 1)).toBe(3);
    expect(nextStage(4, 2)).toBe(3);
    expect(nextStage(4, 3)).toBe(2);
    expect(nextStage(4, 4)).toBe(2);
  });

  it("doubles the penalty at Guru and above", () => {
    expect(nextStage(5, 1)).toBe(3);
    expect(nextStage(6, 3)).toBe(2);
    expect(nextStage(8, 1)).toBe(6);
  });

  it("never drops below Apprentice I", () => {
    expect(nextStage(1, 10)).toBe(1);
    expect(nextStage(2, 8)).toBe(1);
  });
});

describe("nextAvailableAt", () => {
  const t0 = new Date("2026-01-01T00:00:00Z");

  it("uses the WaniKani interval ladder", () => {
    expect(nextAvailableAt(1, t0)!.getTime() - t0.getTime()).toBe(4 * 3600_000);
    expect(nextAvailableAt(2, t0)!.getTime() - t0.getTime()).toBe(8 * 3600_000);
    expect(nextAvailableAt(3, t0)!.getTime() - t0.getTime()).toBe(23 * 3600_000);
    expect(nextAvailableAt(5, t0)!.getTime() - t0.getTime()).toBe(167 * 3600_000);
  });

  it("returns null for burned items", () => {
    expect(nextAvailableAt(9, t0)).toBeNull();
  });
});

const meanings: Meaning[] = [
  { meaning: "Ground", primary: true, acceptedAnswer: true },
  { meaning: "Floor", primary: false, acceptedAnswer: true },
];

describe("checkMeaning", () => {
  it("accepts exact matches case-insensitively", () => {
    expect(checkMeaning("ground", meanings)).toBe("correct");
    expect(checkMeaning("  FLOOR ", meanings)).toBe("correct");
  });

  it("tolerates small typos on longer words", () => {
    expect(checkMeaning("gronud", meanings)).toBe("correct"); // 2 edits, len 6
    expect(checkMeaning("flor", meanings)).toBe("correct"); // 1 edit, len 5
  });

  it("rejects typos on very short words", () => {
    const short: Meaning[] = [{ meaning: "One", primary: true, acceptedAnswer: true }];
    expect(checkMeaning("one", short)).toBe("correct");
    expect(checkMeaning("oen", short)).toBe("incorrect");
  });

  it("honors whitelist and blacklist aux meanings", () => {
    const aux: AuxMeaning[] = [
      { meaning: "earth", type: "whitelist" },
      { meaning: "floor", type: "blacklist" },
    ];
    expect(checkMeaning("earth", meanings, aux)).toBe("correct");
    expect(checkMeaning("floor", meanings, aux)).toBe("incorrect");
  });

  it("accepts user synonyms (case/whitespace-insensitive)", () => {
    expect(checkMeaning("dirt", meanings, [], ["dirt"])).toBe("correct");
    expect(checkMeaning("  DIRT ", meanings, [], ["dirt"])).toBe("correct");
    expect(checkMeaning("dirt", meanings, [], [])).toBe("incorrect");
  });

  it("lets user synonyms override a blacklist entry", () => {
    const aux: AuxMeaning[] = [{ meaning: "soil", type: "blacklist" }];
    expect(checkMeaning("soil", meanings, aux)).toBe("incorrect");
    expect(checkMeaning("soil", meanings, aux, ["soil"])).toBe("correct");
  });

  it("treats empty input as retry", () => {
    expect(checkMeaning("   ", meanings)).toBe("retry");
  });
});

describe("checkReading", () => {
  const readings: Reading[] = [
    { reading: "こう", primary: true, acceptedAnswer: true, type: "onyomi" },
    { reading: "くち", primary: false, acceptedAnswer: false, type: "kunyomi" },
  ];

  it("accepts the requested reading exactly", () => {
    expect(checkReading("こう", readings)).toBe("correct");
  });

  it("matches katakana input against hiragana readings", () => {
    expect(checkReading("コウ", readings)).toBe("correct");
  });

  it("returns retry for a real but unaccepted reading type", () => {
    expect(checkReading("くち", readings)).toBe("retry");
  });

  it("rejects wrong readings with no typo tolerance", () => {
    expect(checkReading("こ", readings)).toBe("incorrect");
    expect(checkReading("こうう", readings)).toBe("incorrect");
  });
});
