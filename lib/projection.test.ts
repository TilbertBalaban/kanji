import { describe, expect, it } from "vitest";
import {
  blendSamples,
  expectedDaysToStage,
  levelPaceMetric,
  projectCompletion,
  type ProjectionInputs,
} from "./projection";
import { BURNED_STAGE, MASTER_STAGE } from "./srs";

const NOW = new Date("2026-01-01T00:00:00.000Z");

// Sum of STAGE_INTERVAL_HOURS up to the target — the flawless-run floor.
const PERFECT_DAYS_TO_MASTER = (4 + 8 + 23 + 47 + 167 + 335) / 24;
const PERFECT_DAYS_TO_BURN = PERFECT_DAYS_TO_MASTER + (719 + 2879) / 24;

function inputs(over: Partial<ProjectionInputs> = {}): ProjectionInputs {
  return {
    totalItems: 100,
    stageCounts: [100, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    currentLevel: 1,
    itemsPerDay: 10,
    levelsPerDay: null,
    passRate: 1,
    ...over,
  };
}

describe("expectedDaysToStage", () => {
  it("is the plain interval sum at a perfect pass rate", () => {
    expect(expectedDaysToStage(MASTER_STAGE, 1)[1]).toBeCloseTo(PERFECT_DAYS_TO_MASTER, 6);
    expect(expectedDaysToStage(BURNED_STAGE, 1)[1]).toBeCloseTo(PERFECT_DAYS_TO_BURN, 6);
  });

  it("is zero at and above the target", () => {
    const ladder = expectedDaysToStage(MASTER_STAGE, 0.9);
    expect(ladder[MASTER_STAGE]).toBe(0);
    expect(ladder[BURNED_STAGE]).toBe(0);
  });

  it("shortens as the starting stage rises", () => {
    const ladder = expectedDaysToStage(BURNED_STAGE, 0.9);
    for (let stage = 1; stage < BURNED_STAGE - 1; stage++) {
      expect(ladder[stage]).toBeGreaterThan(ladder[stage + 1]);
    }
  });

  it("lengthens as the pass rate drops", () => {
    const rates = [1, 0.95, 0.85, 0.7, 0.5];
    const climbs = rates.map((p) => expectedDaysToStage(BURNED_STAGE, p)[1]);
    for (let i = 0; i < climbs.length - 1; i++) {
      expect(climbs[i]).toBeLessThan(climbs[i + 1]);
    }
  });

  it("clamps a hopeless pass rate instead of diverging", () => {
    const climb = expectedDaysToStage(BURNED_STAGE, 0.01);
    expect(Number.isFinite(climb[1])).toBe(true);
    expect(climb[1]).toBeCloseTo(expectedDaysToStage(BURNED_STAGE, 0.35)[1], 6);
  });
});

describe("blendSamples", () => {
  const windows = (week: number | null, month: number | null, lifetime: number | null) => [
    { label: "Last 7 days", weight: 0.5, value: week },
    { label: "Last 30 days", weight: 0.3, value: month },
    { label: "All time", weight: 0.2, value: lifetime },
  ];

  it("weights the recent week hardest", () => {
    expect(blendSamples(windows(10, 0, 0))).toBeCloseTo(5, 6);
    expect(blendSamples(windows(0, 0, 10))).toBeCloseTo(2, 6);
  });

  it("renormalizes over the samples that have data", () => {
    expect(blendSamples(windows(8, null, null))).toBe(8);
    expect(blendSamples(windows(10, 5, null))).toBeCloseTo(8.125, 6);
  });

  it("has no answer without data", () => {
    expect(blendSamples(windows(null, null, null))).toBeNull();
  });
});

describe("levelPaceMetric", () => {
  const start = new Date("2026-01-01T00:00:00.000Z");
  const day = (n: number) => new Date(start.getTime() + n * 24 * 3600_000);

  it("averages the last three level durations against all of them", () => {
    // Durations: 10, 10, 20, 20 — recent mean 16.67, lifetime mean 15.
    const metric = levelPaceMetric(
      [day(10), day(20), day(40), day(60)],
      start,
      day(61),
    );
    expect(metric.samples.map((s) => s.value)).toEqual([50 / 3, 15, 1]);
    expect(metric.blended).toBeCloseTo((50 / 3) * 0.6 + 15 * 0.4, 6);
  });

  it("lets a stalled current level override the historical pace", () => {
    const metric = levelPaceMetric([day(10), day(20)], start, day(320));
    expect(metric.blended).toBe(300);
  });

  it("gives no pace before the first level-up", () => {
    expect(levelPaceMetric([], start, day(30)).blended).toBeNull();
  });

  it("counts the run-up to the first level-up as its duration", () => {
    expect(levelPaceMetric([day(12)], start, day(13)).blended).toBe(12);
  });
});

describe("projectCompletion", () => {
  it("adds the ladder climb to the time spent taking the last lesson", () => {
    const p = projectCompletion(MASTER_STAGE, inputs(), NOW);
    expect(p.bottleneck).toBe("lessons");
    expect(p.days).toBe(Math.ceil(10 + PERFECT_DAYS_TO_MASTER));
    expect(p.date).toBe(
      new Date(NOW.getTime() + p.days! * 24 * 3600_000).toISOString(),
    );
  });

  it("never beats the SRS floor once every item is in flight", () => {
    const p = projectCompletion(
      BURNED_STAGE,
      inputs({ stageCounts: [0, 0, 0, 0, 0, 0, 0, 100, 0, 0], itemsPerDay: 1000 }),
      NOW,
    );
    expect(p.bottleneck).toBe("srs");
    expect(p.days).toBe(Math.ceil((719 + 2879) / 24));
  });

  it("takes the lowest stage still in flight as the floor", () => {
    const spread = [0, 1, 0, 0, 0, 0, 0, 99, 0, 0];
    const p = projectCompletion(BURNED_STAGE, inputs({ stageCounts: spread }), NOW);
    expect(p.days).toBe(Math.ceil(PERFECT_DAYS_TO_BURN));
  });

  it("falls back to level-up pace when it is the slower gate", () => {
    const p = projectCompletion(
      MASTER_STAGE,
      inputs({ itemsPerDay: 1000, levelsPerDay: 1 / 30, currentLevel: 10 }),
      NOW,
    );
    expect(p.bottleneck).toBe("levels");
    expect(p.days).toBe(Math.ceil(50 * 30 + PERFECT_DAYS_TO_MASTER));
  });

  it("ignores level pace for a user who has never levelled up", () => {
    expect(projectCompletion(MASTER_STAGE, inputs({ levelsPerDay: 0 }), NOW).bottleneck).toBe(
      "lessons",
    );
  });

  it("reports no date when the pace cannot be measured", () => {
    const p = projectCompletion(MASTER_STAGE, inputs({ itemsPerDay: null }), NOW);
    expect(p.days).toBeNull();
    expect(p.date).toBeNull();
    expect(p.remaining).toBe(100);
  });

  it("reports no date when finishing would take over a century", () => {
    expect(
      projectCompletion(
        BURNED_STAGE,
        inputs({
          totalItems: 9388,
          stageCounts: [9388, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          itemsPerDay: 0.2,
        }),
        NOW,
      ).days,
    ).toBeNull();
  });

  it("has nothing left to project once every item is at the target", () => {
    const p = projectCompletion(
      MASTER_STAGE,
      inputs({ stageCounts: [0, 0, 0, 0, 0, 0, 0, 60, 40, 0] }),
      NOW,
    );
    expect(p.remaining).toBe(0);
    expect(p.days).toBeNull();
  });

  it("counts burned items as having reached Master", () => {
    const p = projectCompletion(
      MASTER_STAGE,
      inputs({ stageCounts: [10, 0, 0, 0, 0, 0, 0, 0, 0, 90] }),
      NOW,
    );
    expect(p.remaining).toBe(10);
  });
});
