import { describe, expect, it } from "vitest";
import { interleaveByType, orderLessons, sortByLevelThenType } from "./lesson-order";

type Lesson = { id: string; subject: { level: number; type: string; lessonPosition: number } };

function lesson(id: string, level: number, type: string, lessonPosition = 0): Lesson {
  return { id, subject: { level, type, lessonPosition } };
}

const ids = (lessons: Lesson[]) => lessons.map((l) => l.id);
const types = (lessons: Lesson[]) => lessons.map((l) => l.subject.type);

describe("sortByLevelThenType", () => {
  it("orders by level, then radical → kanji → vocab, then lesson position", () => {
    const pool = [
      lesson("v3", 3, "vocabulary", 1),
      lesson("k4b", 4, "kanji", 2),
      lesson("r4", 4, "radical", 0),
      lesson("k4a", 4, "kanji", 1),
      lesson("r3", 3, "radical", 0),
    ];
    expect(ids(sortByLevelThenType(pool))).toEqual(["r3", "v3", "r4", "k4a", "k4b"]);
  });

  it("treats kana_vocabulary as vocabulary", () => {
    const pool = [lesson("kana", 4, "kana_vocabulary"), lesson("k", 4, "kanji")];
    expect(ids(sortByLevelThenType(pool))).toEqual(["k", "kana"]);
  });

  it("does not mutate its input", () => {
    const pool = [lesson("b", 2, "radical"), lesson("a", 1, "radical")];
    sortByLevelThenType(pool);
    expect(ids(pool)).toEqual(["b", "a"]);
  });
});

describe("interleaveByType", () => {
  it("cycles radical → kanji → vocab when the types are evenly matched", () => {
    const pool = [
      ...Array.from({ length: 5 }, (_, i) => lesson(`r${i}`, 4, "radical", i)),
      ...Array.from({ length: 5 }, (_, i) => lesson(`k${i}`, 4, "kanji", i)),
      ...Array.from({ length: 5 }, (_, i) => lesson(`v${i}`, 4, "vocabulary", i)),
    ];
    expect(types(interleaveByType(pool)).slice(0, 6)).toEqual([
      "radical", "kanji", "vocabulary",
      "radical", "kanji", "vocabulary",
    ]);
  });

  it("distributes each type in proportion to the pool, not in equal shares", () => {
    // The real level-4 shape: 5 radicals, 13 kanji, 26 vocabulary. A batch of
    // 5 should mirror those proportions (~0.6 / ~1.5 / ~3), so vocabulary
    // dominates and radicals appear roughly once — an equal-share rotation
    // would wrongly give 2 radicals, 2 kanji, 1 vocabulary.
    const pool = [
      ...Array.from({ length: 5 }, (_, i) => lesson(`r${i}`, 4, "radical", i)),
      ...Array.from({ length: 13 }, (_, i) => lesson(`k${i}`, 4, "kanji", i)),
      ...Array.from({ length: 26 }, (_, i) => lesson(`v${i}`, 4, "vocabulary", i)),
    ];
    const batch = types(interleaveByType(pool)).slice(0, 5);
    expect(batch.filter((t) => t === "radical")).toHaveLength(1);
    expect(batch.filter((t) => t === "kanji")).toHaveLength(1);
    expect(batch.filter((t) => t === "vocabulary")).toHaveLength(3);
  });

  it("spreads a scarce type evenly across the whole run rather than clumping it", () => {
    const pool = [
      ...Array.from({ length: 4 }, (_, i) => lesson(`r${i}`, 4, "radical", i)),
      ...Array.from({ length: 36 }, (_, i) => lesson(`v${i}`, 4, "vocabulary", i)),
    ];
    const positions = types(interleaveByType(pool))
      .map((t, i) => (t === "radical" ? i : -1))
      .filter((i) => i >= 0);
    // 4 radicals among 40 items → one per decile-ish block, never adjacent.
    expect(positions).toHaveLength(4);
    const gaps = positions.slice(1).map((p, i) => p - positions[i]);
    expect(Math.min(...gaps)).toBeGreaterThan(1);
  });

  it("keeps every lesson exactly once", () => {
    const pool = [
      lesson("r0", 4, "radical"),
      lesson("k0", 4, "kanji"),
      lesson("k1", 4, "kanji"),
      lesson("v0", 4, "vocabulary"),
      lesson("v1", 4, "kana_vocabulary"),
    ];
    expect(ids(interleaveByType(pool)).sort()).toEqual(["k0", "k1", "r0", "v0", "v1"]);
  });

  it("serves every item when one type is nearly drained", () => {
    // The real level-4 shape that motivated this: radicals nearly drained,
    // vocab plentiful. The lone radical lands mid-run (its slot midpoint is
    // 0.5) rather than leading, and nothing is dropped.
    const pool = [
      lesson("r0", 4, "radical"),
      ...Array.from({ length: 3 }, (_, i) => lesson(`k${i}`, 4, "kanji", i)),
      ...Array.from({ length: 4 }, (_, i) => lesson(`v${i}`, 4, "vocabulary", i)),
    ];
    const ordered = interleaveByType(pool);
    expect(ordered).toHaveLength(8);
    expect(ids(ordered)).toEqual(["v0", "k0", "v1", "r0", "k1", "v2", "k2", "v3"]);
  });

  it("serves a single-type pool unchanged in default order", () => {
    const pool = [lesson("r1", 4, "radical", 1), lesson("r0", 4, "radical", 0)];
    expect(ids(interleaveByType(pool))).toEqual(["r0", "r1"]);
  });

  it("drains lower-level items first within a type", () => {
    const pool = [
      lesson("v4", 4, "vocabulary", 0),
      lesson("v3", 3, "vocabulary", 0),
      lesson("r4", 4, "radical", 0),
    ];
    // Leftover level-3 vocab precedes level-4 vocab even though the batch mixes.
    expect(ids(interleaveByType(pool))).toEqual(["v3", "r4", "v4"]);
  });

  it("handles an empty pool", () => {
    expect(interleaveByType([])).toEqual([]);
  });
});

describe("orderLessons", () => {
  const pool = [
    lesson("r0", 4, "radical", 0),
    lesson("r1", 4, "radical", 1),
    lesson("k0", 4, "kanji", 0),
  ];

  it("interleaves when enabled", () => {
    expect(ids(orderLessons(pool, true))).toEqual(["r0", "k0", "r1"]);
  });

  it("falls back to WaniKani's default order when disabled", () => {
    expect(ids(orderLessons(pool, false))).toEqual(["r0", "r1", "k0"]);
  });
});
