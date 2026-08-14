// Completion forecast: when every WaniKani item will be Master (stage 7) or
// Burned (stage 9) at the user's current pace.
//
// Three independent constraints decide the finish date, and the slowest wins:
//
//   lessons — items still un-lessoned, divided by the blended lesson pace
//   levels  — level-ups still needed to unlock the remaining content
//   srs     — the intervals themselves: the item sitting at the lowest stage
//             cannot reach the target faster than the SRS ladder allows
//
// The first two are followed by the ladder climb for the last item started,
// so the forecast never promises a date the SRS could not physically produce
// (burning takes ~174 days from a lesson even at 100% accuracy).

import { BURNED_STAGE, MAX_LEVEL, STAGE_INTERVAL_HOURS, nextStage } from "./srs";

const DAY_MS = 24 * 3600_000;

// ---------- Blended pace ----------

export interface WeightedSample {
  label: string;
  weight: number;
  value: number | null;
}

export interface Metric {
  samples: WeightedSample[];
  blended: number | null;
}

// Recency wins, but a single week is noisy — one holiday would double the
// estimate — so the 30-day and lifetime terms anchor it.
export const TIME_WINDOWS = [
  { label: "Last 7 days", days: 7, weight: 0.5 },
  { label: "Last 30 days", days: 30, weight: 0.3 },
  { label: "All time", days: null, weight: 0.2 },
] as const;

/**
 * Weighted mean over the samples that have data, renormalized so a missing one
 * (a user less than 30 days in) shifts its weight to the others instead of
 * dragging the result toward zero.
 */
export function blendSamples(samples: { weight: number; value: number | null }[]): number | null {
  let sum = 0;
  let weight = 0;
  for (const sample of samples) {
    if (sample.value === null) continue;
    sum += sample.value * sample.weight;
    weight += sample.weight;
  }
  return weight > 0 ? sum / weight : null;
}

export function toMetric(samples: WeightedSample[]): Metric {
  return { samples, blended: blendSamples(samples) };
}

// ---------- Level-up pace ----------

// How many recent level-ups the "recent" sample averages over.
const RECENT_LEVELS = 3;

const RECENT_LEVEL_WEIGHT = 0.6;
const LIFETIME_LEVEL_WEIGHT = 0.4;

/**
 * Days per level, blended the same way as the time-windowed metrics but over
 * *events* rather than calendar windows: level-ups are rare enough that a
 * 7-day window holds none even for a fast user, so a windowed rate would read
 * as a standstill for everyone. The unfinished current level is a floor, not a
 * weighted term — someone stuck on level 5 for a year is not still going at
 * their old pace, but someone two days into a level is not going faster.
 */
export function levelPaceMetric(
  levelUps: Date[],
  accountStart: Date | null,
  now: Date,
): Metric {
  const sorted = [...levelUps].sort((a, b) => a.getTime() - b.getTime());
  const durations: number[] = [];
  let previous = accountStart;
  for (const levelUp of sorted) {
    if (previous) durations.push((levelUp.getTime() - previous.getTime()) / DAY_MS);
    previous = levelUp;
  }
  const currentLevelDays = previous ? (now.getTime() - previous.getTime()) / DAY_MS : null;

  const samples: WeightedSample[] = [
    {
      label: `Last ${RECENT_LEVELS} levels`,
      weight: RECENT_LEVEL_WEIGHT,
      value: mean(durations.slice(-RECENT_LEVELS)),
    },
    { label: "All levels", weight: LIFETIME_LEVEL_WEIGHT, value: mean(durations) },
    { label: "Current level", weight: 0, value: currentLevelDays },
  ];
  const blended = blendSamples(samples);
  return {
    samples,
    blended: blended === null ? null : Math.max(blended, currentLevelDays ?? 0),
  };
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

// ---------- SRS ladder ----------

// Below this a miss undoes more than a pass gains and the expected climb
// diverges; the forecast would read as "never" for what is really a rough
// patch, so treat anything worse as this.
const MIN_PASS_RATE = 0.35;

// The Learning Zone midpoint, used until the user has reviews to measure.
export const ASSUMED_PASS_RATE = 0.9;

/**
 * Expected days for one item to first reach `target`, indexed by the stage it
 * starts from. `passRate` is the share of reviews answered with no mistake at
 * all: a pass moves up one stage, a miss drops it per nextStage(), so the
 * climb is a random walk and its expected time solves
 *
 *   E[s] = interval(s) + p·E[s+1] + (1-p)·E[demoted(s)]
 *
 * Solved by iteration — E[1] depends on itself (Apprentice I cannot demote),
 * so there is no single backward pass.
 */
export function expectedDaysToStage(target: number, passRate: number): number[] {
  const p = Math.min(1, Math.max(MIN_PASS_RATE, passRate));
  const hours = new Array<number>(BURNED_STAGE + 2).fill(0);
  for (let pass = 0; pass < 500; pass++) {
    let delta = 0;
    for (let stage = target - 1; stage >= 1; stage--) {
      const next =
        STAGE_INTERVAL_HOURS[stage] +
        p * hours[stage + 1] +
        (1 - p) * hours[nextStage(stage, 1)];
      delta = Math.max(delta, Math.abs(next - hours[stage]));
      hours[stage] = next;
    }
    if (delta < 1e-6) break;
  }
  return hours.map((h) => h / 24);
}

// ---------- Projection ----------

export type Bottleneck = "lessons" | "levels" | "srs";

export interface ProjectionInputs {
  totalItems: number;
  /** Items per SRS stage; index 0 covers both locked and un-lessoned items. */
  stageCounts: number[];
  currentLevel: number;
  itemsPerDay: number | null;
  levelsPerDay: number | null;
  passRate: number | null;
}

export interface Projection {
  target: number;
  remaining: number;
  /** null when already finished, or when the pace can't be measured. */
  days: number | null;
  date: string | null;
  bottleneck: Bottleneck | null;
}

// Past this the pace is effectively a standstill and a date is noise.
const MAX_HORIZON_DAYS = 365 * 100;

export function projectCompletion(
  target: number,
  input: ProjectionInputs,
  now: Date = new Date(),
): Projection {
  const reached = input.stageCounts
    .slice(target)
    .reduce((total, count) => total + count, 0);
  const remaining = Math.max(0, input.totalItems - reached);
  if (remaining === 0) {
    return { target, remaining, days: null, date: null, bottleneck: null };
  }

  const ladder = expectedDaysToStage(target, input.passRate ?? ASSUMED_PASS_RATE);
  const climbFromLesson = ladder[1];
  const notStarted = input.stageCounts[0];

  // An item that has never been reviewed drags the finish date by its whole
  // climb; one already at Guru only by what is left of it.
  let srsFloor = 0;
  for (let stage = 1; stage < target; stage++) {
    if (input.stageCounts[stage] > 0) {
      srsFloor = ladder[stage];
      break;
    }
  }

  const candidates: { key: Bottleneck; days: number }[] = [{ key: "srs", days: srsFloor }];
  if (notStarted > 0) {
    candidates.push({
      key: "lessons",
      days: (input.itemsPerDay ? notStarted / input.itemsPerDay : Infinity) + climbFromLesson,
    });
    // No level-up history yet (a brand-new account) leaves lesson pace as the
    // only signal rather than making the whole forecast unknown.
    if (input.levelsPerDay) {
      candidates.push({
        key: "levels",
        days: (MAX_LEVEL - input.currentLevel) / input.levelsPerDay + climbFromLesson,
      });
    }
  }

  const slowest = candidates.reduce((a, b) => (b.days > a.days ? b : a));
  if (!Number.isFinite(slowest.days) || slowest.days > MAX_HORIZON_DAYS) {
    return { target, remaining, days: null, date: null, bottleneck: slowest.key };
  }

  const days = Math.ceil(slowest.days);
  return {
    target,
    remaining,
    days,
    date: new Date(now.getTime() + days * 24 * 3600_000).toISOString(),
    bottleneck: slowest.key,
  };
}
