"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SubjectChar } from "@/components/SubjectChar";
import { GURU_STAGE, MAX_LEVEL, STAGE_NAMES } from "@/lib/srs";
import { subjectPath } from "@/lib/subject-url";
import { STAGE_GROUP_COLORS, TYPE_COLORS } from "@/lib/ui";

interface StageBucket {
  stage: number;
  radical: number;
  kanji: number;
  vocabulary: number;
}

interface Mistake {
  id: number;
  type: string;
  characters: string | null;
  characterImage: string | null;
  slug: string;
}

interface Summary {
  currentLevel: number;
  lessonCount: number;
  lessonsAvailableToday: number;
  reviewCount: number;
  reviewBatchSize: number;
  customReviewCount: number;
  grammarReviewCount: number;
  grammarLessonCount: number;
  grammarLessonsAvailableToday: number;
  forecast: Record<string, number>;
  spread: StageBucket[];
  recentMistakes: Mistake[];
  correctReviews: CorrectReviewsData;
}

interface CorrectReviewsData {
  pastWeek: number | null;
  previousWeek: number | null;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const SPREAD_GROUPS = ["radical", "kanji", "vocabulary"] as const;

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    // A 401 (expired session) or 500 also returns JSON, so blindly setting the
    // parsed body used to crash the render on `summary.forecast`.
    fetch("/api/summary")
      .then(async (r) => {
        if (!r.ok) return setError(true);
        setSummary(await r.json());
      })
      .catch(() => setError(true));
  }, []);

  if (error)
    return <p className="text-slate-500">Failed to load the dashboard — reload to retry.</p>;
  if (!summary) return <p className="text-slate-500">Loading…</p>;

  const forecastEntries = Object.entries(summary.forecast).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/lessons"
          className="rounded-xl bg-pink-600 p-6 text-white shadow transition-transform hover:scale-[1.02]"
        >
          <div className="text-4xl font-bold">{summary.lessonsAvailableToday}</div>
          <div className="mt-1 text-pink-100">
            Lessons available today
            {summary.lessonCount > summary.lessonsAvailableToday &&
              ` · ${summary.lessonCount} in queue`}
          </div>
        </Link>
        <Link
          href="/reviews"
          className="rounded-xl bg-sky-600 p-6 text-white shadow transition-transform hover:scale-[1.02]"
        >
          <div className="text-4xl font-bold">{summary.reviewCount}</div>
          <div className="mt-1 text-sky-100">
            Reviews due now
            {summary.reviewCount > summary.reviewBatchSize &&
              ` · ${Math.ceil(summary.reviewCount / summary.reviewBatchSize)} batches of ${summary.reviewBatchSize}`}
          </div>
        </Link>
        <Link
          href={summary.customReviewCount > 0 ? "/custom/reviews" : "/custom"}
          className="rounded-xl bg-amber-500 p-6 text-white shadow transition-transform hover:scale-[1.02]"
        >
          <div className="text-4xl font-bold">{summary.customReviewCount}</div>
          <div className="mt-1 text-amber-100">Custom vocab reviews due</div>
        </Link>
        <div
          className="rounded-xl p-6 text-white shadow transition-transform hover:scale-[1.02]"
          style={{ backgroundColor: TYPE_COLORS.grammar }}
        >
          <Link href="/grammar/lessons" className="block">
            <div className="text-4xl font-bold">{summary.grammarLessonsAvailableToday}</div>
            <div className="mt-1 text-white opacity-90">Grammar lessons available today</div>
          </Link>
          {summary.grammarLessonCount > summary.grammarLessonsAvailableToday &&
            summary.lessonCount === 0 && (
            <Link
              href="/grammar/lessons?extra=1"
              className="mt-2 inline-block text-sm font-medium text-white underline decoration-white/50 underline-offset-2 hover:decoration-white"
            >
              Start extra lesson →
            </Link>
          )}
        </div>
        <Link
          href="/grammar/reviews"
          className="rounded-xl bg-emerald-700 p-6 text-white shadow transition-transform hover:scale-[1.02]"
        >
          <div className="text-4xl font-bold">{summary.grammarReviewCount}</div>
          <div className="mt-1 text-emerald-100">Grammar reviews due</div>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LevelProgress currentLevel={summary.currentLevel} />
        <ActiveItemSpread spread={summary.spread} />
      </div>

      <CompletionForecast />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <CorrectReviews data={summary.correctReviews} />
        <div className="lg:col-span-2">
          <RecentMistakes mistakes={summary.recentMistakes} />
        </div>
      </div>

      <section className="rounded-xl bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold">Review forecast (next 24h)</h2>
        {forecastEntries.length === 0 ? (
          <p className="text-sm text-slate-500">No reviews scheduled in the next 24 hours.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {forecastEntries.map(([iso, count]) => (
              <li key={iso} className="flex justify-between border-b border-slate-100 py-1">
                <span>
                  {new Date(iso).toLocaleString(undefined, {
                    weekday: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="font-medium">+{count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------- Correct Reviews (Learning Zone) ----------

// Getting 85-95% of answers right is "The Learning Zone": hard enough to
// stretch memory, easy enough to keep up. Purely informational, like on
// WaniKani — it never gates lessons.
const ZONE_MIN = 0.85;
const ZONE_MAX = 0.95;
const GAUGE_TICKS = 25;

function lerpColor(a: string, b: string, t: number): string {
  const ah = parseInt(a.slice(1), 16);
  const bh = parseInt(b.slice(1), 16);
  const hex = [16, 8, 0]
    .map((s) => {
      const av = (ah >> s) & 0xff;
      const bv = (bh >> s) & 0xff;
      return Math.round(av + (bv - av) * t)
        .toString(16)
        .padStart(2, "0");
    })
    .join("");
  return `#${hex}`;
}

// Radical blue → vocabulary purple → kanji pink across the arc.
function tickColor(t: number): string {
  return t < 0.5
    ? lerpColor(TYPE_COLORS.radical, TYPE_COLORS.vocabulary, t * 2)
    : lerpColor(TYPE_COLORS.vocabulary, TYPE_COLORS.kanji, (t - 0.5) * 2);
}

function CorrectReviews({ data }: { data: CorrectReviewsData }) {
  const pct = data.pastWeek;
  const zone =
    pct === null ? null : pct < ZONE_MIN ? "below" : pct <= ZONE_MAX ? "inside" : "above";

  return (
    <section className="flex h-full flex-col rounded-xl bg-white p-6 shadow">
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <svg viewBox="0 0 200 104" className="w-44" aria-hidden>
          {Array.from({ length: GAUGE_TICKS }, (_, i) => {
            const t = i / (GAUGE_TICKS - 1);
            const angle = Math.PI * (1 - t);
            const x = Math.cos(angle);
            const y = Math.sin(angle);
            const filled = pct !== null && (i + 0.5) / GAUGE_TICKS <= pct;
            return (
              <line
                key={i}
                x1={100 + 72 * x}
                y1={100 - 72 * y}
                x2={100 + 96 * x}
                y2={100 - 96 * y}
                stroke={filled ? tickColor(t) : "#e2e8f0"}
                strokeWidth={8}
              />
            );
          })}
        </svg>

        <div className="rounded-full bg-slate-100 px-3 py-1 text-center text-xs text-slate-600">
          {zone === null && "No reviews yet this week"}
          {zone === "below" && (
            <>
              You&apos;re below <span className="font-bold">The Learning Zone</span> — maybe
              ease up on lessons
            </>
          )}
          {zone === "inside" && (
            <>
              You&apos;re inside <span className="font-bold">The Learning Zone</span>!
            </>
          )}
          {zone === "above" && (
            <>
              You&apos;re above <span className="font-bold">The Learning Zone</span> — room
              for more lessons
            </>
          )}
        </div>

        <div className="mt-2 text-center">
          <h2 className="text-lg font-semibold text-slate-500">Correct Reviews</h2>
          <div className="text-4xl font-bold text-slate-800">
            {pct === null ? "—" : `${(pct * 100).toFixed(2)}%`}
          </div>
          <div className="text-sm text-slate-500">Past 7 Days</div>
        </div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3 text-center text-sm text-slate-600">
        Previous Period:{" "}
        <span className="font-bold text-slate-800">
          {data.previousWeek === null ? "—" : `${(data.previousWeek * 100).toFixed(2)}%`}
        </span>
      </div>
    </section>
  );
}

// ---------- Completion Forecast ----------

interface WeightedSample {
  label: string;
  weight: number;
  value: number | null;
}

interface Metric {
  samples: WeightedSample[];
  blended: number | null;
}

interface Projection {
  remaining: number;
  days: number | null;
  date: string | null;
  bottleneck: "lessons" | "levels" | "srs" | null;
}

interface Forecast {
  totalItems: number;
  lessonPace: Metric;
  levelPace: Metric;
  passRate: Metric;
  master: Projection;
  burned: Projection;
}

const BOTTLENECK_LABELS: Record<NonNullable<Projection["bottleneck"]>, string> = {
  lessons: "Paced by lessons — every item still has to be taught.",
  levels: "Paced by level-ups — content unlocks slower than you can learn it.",
  srs: "Paced by the SRS intervals themselves — nothing left to speed up.",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDuration(days: number): string {
  if (days < 60) return `${Math.round(days)} days`;
  const years = Math.floor(days / 365.25);
  const months = Math.round((days - years * 365.25) / 30.44);
  if (years === 0) return `${months} months`;
  return months === 0 ? `${years} yr` : `${years} yr ${months} mo`;
}

function formatRate(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function CompletionForecast() {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/forecast")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setForecast)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null;

  return (
    <section className="rounded-xl bg-white p-6 shadow">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span aria-hidden>🏁</span> Finish Line
        </h2>
        <span className="text-sm text-slate-500">
          {forecast ? `all ${forecast.totalItems.toLocaleString()} items` : ""}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-500">
        Radicals, kanji and vocabulary across all {MAX_LEVEL} levels, projected from your
        lesson pace, level-up pace and review accuracy.
      </p>

      {!forecast ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ProjectionCard
              label="Everything Mastered"
              color={STAGE_GROUP_COLORS.master}
              projection={forecast.master}
            />
            <ProjectionCard
              label="Everything Burned"
              color={STAGE_GROUP_COLORS.burned}
              projection={forecast.burned}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              label="Lessons per day"
              metric={forecast.lessonPace}
              format={formatRate}
            />
            <MetricCard
              label="Days per level"
              metric={forecast.levelPace}
              format={formatRate}
            />
            <MetricCard
              label="Reviews passed first try"
              metric={forecast.passRate}
              format={formatPercent}
            />
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Each input is a weighted blend of its samples — the percentage after a sample is
            how much it counts. Recent samples weigh most; the older ones keep one bad week
            from moving the date by years.
          </p>
        </>
      )}
    </section>
  );
}

function ProjectionCard({
  label,
  color,
  projection,
}: {
  label: string;
  color: string;
  projection: Projection;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
        <span className="font-medium text-slate-700">{label}</span>
      </div>
      {projection.remaining === 0 ? (
        <p className="mt-2 text-2xl font-bold text-emerald-600">Done! 🎉</p>
      ) : projection.date === null ? (
        <>
          <p className="mt-2 text-2xl font-bold text-slate-400">—</p>
          <p className="mt-1 text-sm text-slate-500">
            Not enough of a pace yet to put a date on it.
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 text-2xl font-bold text-slate-800">
            {formatDate(projection.date)}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            ~{formatDuration(projection.days!)} away ·{" "}
            {projection.remaining.toLocaleString()} to go
          </p>
        </>
      )}
      {projection.bottleneck && projection.remaining > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {BOTTLENECK_LABELS[projection.bottleneck]}
        </p>
      )}
    </div>
  );
}

function MetricCard({
  label,
  metric,
  format,
}: {
  label: string;
  metric: Metric;
  format: (value: number | null) => string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-slate-600">{label}</span>
        <span className="text-xl font-bold tabular-nums text-slate-800">
          {format(metric.blended)}
        </span>
      </div>
      <ul className="mt-2 space-y-1 text-xs text-slate-500">
        {metric.samples.map((sample) => (
          <li key={sample.label} className="flex justify-between gap-2">
            <span>
              {sample.label}
              {sample.weight > 0 && (
                <span className="ml-1 text-slate-400">
                  ×{Math.round(sample.weight * 100)}%
                </span>
              )}
            </span>
            <span className="tabular-nums">{format(sample.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Level Progress ----------

interface LevelSubject {
  type: string;
  srsStage: number | null;
}

const PROGRESS_ROWS: {
  key: string;
  label: string;
  glyph: string;
  types: string[];
}[] = [
  { key: "radical", label: "Radicals", glyph: "氵", types: ["radical"] },
  { key: "kanji", label: "Kanji", glyph: "字", types: ["kanji"] },
  {
    key: "vocabulary",
    label: "Vocabulary",
    glyph: "語",
    types: ["vocabulary", "kana_vocabulary"],
  },
];

function LevelProgress({ currentLevel }: { currentLevel: number }) {
  const [level, setLevel] = useState(currentLevel);
  // Keyed to the level it was fetched for: switching levels shows the loading
  // state without a synchronous reset, and a slow response for a previously
  // selected level can't clobber the current one.
  const [result, setResult] = useState<{ level: number; subjects: LevelSubject[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/levels/${level}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setResult({ level, subjects: data.subjects });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [level]);

  const subjects = result?.level === level ? result.subjects : null;

  const guru = (types: string[]) =>
    subjects?.filter((s) => types.includes(s.type) && (s.srsStage ?? 0) >= GURU_STAGE)
      .length ?? 0;
  const total = (types: string[]) =>
    subjects?.filter((s) => types.includes(s.type)).length ?? 0;

  const kanjiGuru = guru(["kanji"]);
  const kanjiTotal = total(["kanji"]);
  const threshold = Math.ceil(kanjiTotal * 0.9);
  const remaining = Math.max(0, threshold - kanjiGuru);

  return (
    <section className="rounded-xl bg-white p-6 shadow">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Level Progress</h2>
        <div className="flex items-center gap-2 text-slate-600">
          <button
            onClick={() => setLevel((l) => Math.max(1, l - 1))}
            disabled={level <= 1}
            className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
            aria-label="Previous level"
          >
            ‹
          </button>
          <span className="text-sm font-medium">Level {level}</span>
          <button
            onClick={() => setLevel((l) => Math.min(MAX_LEVEL, l + 1))}
            disabled={level >= MAX_LEVEL}
            className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
            aria-label="Next level"
          >
            ›
          </button>
        </div>
      </div>

      <p className="mt-2 text-sm text-slate-500">
        Number of items <span className="font-semibold text-slate-700">Guru</span>&apos;d in
        this level.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PROGRESS_ROWS.map((row) => {
          const g = guru(row.types);
          const t = total(row.types);
          const pct = t ? (g / t) * 100 : 0;
          return (
            <div key={row.key} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-2">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded text-sm font-bold text-white"
                  style={{ backgroundColor: TYPE_COLORS[row.key] }}
                >
                  {row.glyph}
                </span>
                <span className="font-medium text-slate-700">{row.label}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: TYPE_COLORS[row.key] }}
                />
              </div>
              <div className="mt-2 flex items-baseline justify-between text-sm">
                <span className="font-bold text-slate-800">
                  {g}/{t}
                </span>
                <Link href={`/levels/${level}`} className="text-sky-600 hover:underline">
                  See All ›
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-sm text-slate-600">
        {remaining > 0 ? (
          <>
            Guru <span className="font-bold text-slate-800">{remaining} more kanji</span> to
            level up.
          </>
        ) : kanjiTotal > 0 ? (
          <span className="font-semibold text-emerald-600">Level requirements met! 🎉</span>
        ) : (
          "No kanji at this level yet."
        )}
      </p>
      <div className="mt-2 flex gap-1">
        {Array.from({ length: threshold }, (_, i) => (
          <div
            key={i}
            className={`h-3 flex-1 rounded-sm ${i < kanjiGuru ? "bg-emerald-500" : "bg-slate-200"}`}
          />
        ))}
      </div>
    </section>
  );
}

// ---------- Active Item Spread ----------

function ActiveItemSpread({ spread }: { spread: StageBucket[] }) {
  const totals = spread.map((s) => s.radical + s.kanji + s.vocabulary);
  const max = Math.max(...totals, 1);
  const niceMax = Math.max(30, Math.ceil(max / 30) * 30);
  const gridLines = [1, 2, 3, 4, 5].map((i) => (niceMax / 5) * i);

  return (
    <section className="rounded-xl bg-white p-6 shadow">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Active Item Spread</h2>
        <Link href="/levels" className="text-sm text-sky-600 hover:underline">
          Details ›
        </Link>
      </div>

      <div className="mt-6 flex gap-2">
        {/* y-axis labels */}
        <div className="relative h-40 w-8 shrink-0 text-right text-xs text-slate-400">
          {gridLines.map((v) => (
            <span
              key={v}
              className="absolute right-0 -translate-y-1/2"
              style={{ bottom: `${(v / niceMax) * 100}%` }}
            >
              {v}
            </span>
          ))}
        </div>

        {/* plot */}
        <div className="flex-1">
          <div className="relative h-40">
            {gridLines.map((v) => (
              <div
                key={v}
                className="absolute inset-x-0 border-t border-slate-100"
                style={{ bottom: `${(v / niceMax) * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-2">
              {spread.map((bucket) => {
                const total = bucket.radical + bucket.kanji + bucket.vocabulary;
                return (
                  <div
                    key={bucket.stage}
                    className="group relative flex flex-1 flex-col justify-end"
                    title={`${STAGE_NAMES[bucket.stage]}: ${total} items`}
                  >
                    {SPREAD_GROUPS.map((g) => {
                      const count = bucket[g];
                      if (count === 0) return null;
                      return (
                        <div
                          key={g}
                          style={{
                            height: `${(count / niceMax) * 160}px`,
                            backgroundColor: TYPE_COLORS[g],
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          {/* x-axis labels */}
          <div className="mt-2 flex gap-2 text-center text-xs font-medium text-slate-500">
            {spread.map((bucket) => (
              <div key={bucket.stage} className="flex-1">
                {ROMAN[bucket.stage - 1]}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-center gap-4 text-xs text-slate-500">
        {SPREAD_GROUPS.map((g) => (
          <span key={g} className="flex items-center gap-1.5 capitalize">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: TYPE_COLORS[g] }}
            />
            {g}
          </span>
        ))}
      </div>
    </section>
  );
}

// ---------- Recent Mistakes ----------

function RecentMistakes({ mistakes }: { mistakes: Mistake[] }) {
  const none = mistakes.length === 0;
  return (
    <section className="overflow-hidden rounded-xl bg-white shadow">
      <div className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span aria-hidden>🐢</span> Recent Mistakes
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Mistakes from the past 24 hours. Give them some extra love.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          {none ? (
            <div
              aria-disabled
              className="flex flex-1 cursor-not-allowed items-center justify-between rounded-lg border border-slate-200 px-4 py-3 opacity-50"
            >
              <span className="font-semibold text-slate-700">Extra Study</span>
              <span className="flex items-center gap-2 text-slate-500">
                <span className="rounded-full border border-slate-300 px-2.5 py-0.5 text-sm">0</span>
                ›
              </span>
            </div>
          ) : (
            <Link
              href="/reviews?source=mistakes"
              className="flex flex-1 items-center justify-between rounded-lg border border-slate-200 px-4 py-3 shadow-sm transition-colors hover:bg-slate-50"
            >
              <span className="font-semibold text-slate-700">Extra Study</span>
              <span className="flex items-center gap-2 text-slate-500">
                <span className="rounded-full border border-slate-300 px-2.5 py-0.5 text-sm">
                  {mistakes.length}
                </span>
                ›
              </span>
            </Link>
          )}
          {none ? (
            <div
              aria-disabled
              className="flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-3 font-semibold text-slate-700 opacity-50"
            >
              Redo Lessons ↺
            </div>
          ) : (
            <Link
              href="/lessons?source=mistakes"
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-3 font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              Redo Lessons ↺
            </Link>
          )}
        </div>
      </div>

      {mistakes.length > 0 && (
        <div className="flex flex-wrap gap-2 bg-slate-100 p-4">
          {mistakes.map((m) => (
            <Link
              key={m.id}
              href={subjectPath(m)}
              className="flex items-center justify-center rounded-lg px-4 py-2 text-xl text-white shadow-sm transition-transform hover:scale-105"
              style={{ backgroundColor: TYPE_COLORS[m.type] }}
            >
              <SubjectChar characters={m.characters} characterImage={m.characterImage} />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
