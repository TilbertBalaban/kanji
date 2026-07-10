"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SubjectChar } from "@/components/SubjectChar";
import { GURU_STAGE, STAGE_NAMES } from "@/lib/srs";
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
  levelProgress: { passedKanji: number; totalKanji: number; threshold: number };
  stageCounts: Record<string, number>;
  forecast: Record<string, number>;
  spread: StageBucket[];
  recentMistakes: Mistake[];
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const SPREAD_GROUPS = ["radical", "kanji", "vocabulary"] as const;

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    fetch("/api/summary")
      .then((r) => r.json())
      .then(setSummary);
  }, []);

  if (!summary) return <p className="text-slate-500">Loading…</p>;

  const forecastEntries = Object.entries(summary.forecast).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <div className="mt-1 text-sky-100">Reviews due now</div>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LevelProgress currentLevel={summary.currentLevel} />
        <ActiveItemSpread spread={summary.spread} />
      </div>

      <RecentMistakes mistakes={summary.recentMistakes} />

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
  const [subjects, setSubjects] = useState<LevelSubject[] | null>(null);

  useEffect(() => {
    setSubjects(null);
    fetch(`/api/levels/${level}`)
      .then((r) => r.json())
      .then((data) => setSubjects(data.subjects));
  }, [level]);

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
            onClick={() => setLevel((l) => Math.min(60, l + 1))}
            disabled={level >= 60}
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
