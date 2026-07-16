"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GURU_STAGE, STAGE_NAMES } from "@/lib/srs";
import { STAGE_GROUP_COLORS, stageGroup, TYPE_COLORS } from "@/lib/ui";

interface GrammarPointRow {
  id: number;
  title: string;
  jlptLevel: number;
  position: number;
  lessonId: number;
  lessonDescription: string;
  meaning: string;
  slug: string;
  srsStage: number | null;
  availableAt: string | null;
}

interface GrammarSummary {
  points: GrammarPointRow[];
  dueCount: number;
  lessonCount: number;
  lessonsAvailableToday: number;
}

interface GrammarMistake {
  grammarPoint: { id: number; title: string; meaning: string; slug: string };
}

interface GrammarAnalytics {
  correctReviews: { pastWeek: number | null; previousWeek: number | null };
  forecast: Record<string, number>;
  recentMistakes: GrammarMistake[];
}

const LEVELS = [5, 4, 3, 2, 1];

export default function GrammarPage() {
  const [data, setData] = useState<GrammarSummary | null>(null);
  const [analytics, setAnalytics] = useState<GrammarAnalytics | null>(null);
  const [query, setQuery] = useState("");
  const [openLevels, setOpenLevels] = useState<Set<number>>(new Set(LEVELS));
  const [openLessons, setOpenLessons] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/grammar")
      .then((r) => r.json())
      .then(setData);
    fetch("/api/grammar/summary")
      .then((r) => r.json())
      .then(setAnalytics);
  }, []);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  // Level -> Lesson id -> points, in catalog order (position is already
  // contiguous per lesson within a level, since Bunpro's own grammar_order —
  // which our seed sorts by — walks lesson by lesson).
  const grouped = useMemo(() => {
    if (!data) return new Map<number, Map<number, GrammarPointRow[]>>();
    const byLevel = new Map<number, Map<number, GrammarPointRow[]>>();
    for (const p of data.points) {
      if (searching) {
        const hay = `${p.title} ${p.meaning}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      if (!byLevel.has(p.jlptLevel)) byLevel.set(p.jlptLevel, new Map());
      const byLesson = byLevel.get(p.jlptLevel)!;
      if (!byLesson.has(p.lessonId)) byLesson.set(p.lessonId, []);
      byLesson.get(p.lessonId)!.push(p);
    }
    return byLevel;
  }, [data, q, searching]);

  // Local "N5 Lesson 1", "N5 Lesson 2"... numbering — lessonId is a global
  // Bunpro id (1..50), but the catalog UI numbers lessons within their level.
  const localLessonNumber = useMemo(() => {
    if (!data) return new Map<number, number>();
    const numbering = new Map<number, number>();
    for (const level of LEVELS) {
      const ids = [...new Set(data.points.filter((p) => p.jlptLevel === level).map((p) => p.lessonId))].sort(
        (a, b) => a - b,
      );
      ids.forEach((id, i) => numbering.set(id, i + 1));
    }
    return numbering;
  }, [data]);

  if (!data) return <p className="text-slate-500">Loading grammar…</p>;

  const toggleLevel = (level: number) => {
    setOpenLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };
  const toggleLesson = (lessonId: number) => {
    setOpenLessons((prev) => {
      const next = new Set(prev);
      if (next.has(lessonId)) next.delete(lessonId);
      else next.add(lessonId);
      return next;
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Grammar</h1>
          <p className="mt-1 text-sm text-slate-500">
            N5→N1 grammar points, studied by cloze review — separate from the WaniKani
            progression.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {data.lessonsAvailableToday > 0 && (
            <Link
              href="/grammar/lessons"
              className="rounded-lg px-5 py-2.5 font-medium text-white shadow transition-transform hover:scale-[1.02]"
              style={{ backgroundColor: TYPE_COLORS.grammar }}
            >
              {data.lessonsAvailableToday} lesson{data.lessonsAvailableToday === 1 ? "" : "s"} available →
            </Link>
          )}
          {data.lessonCount > data.lessonsAvailableToday && (
            <Link
              href="/grammar/lessons?extra=1"
              className="rounded-lg border-2 px-5 py-2.5 font-medium shadow-sm transition-transform hover:scale-[1.02]"
              style={{ borderColor: TYPE_COLORS.grammar, color: TYPE_COLORS.grammar }}
            >
              Start extra lesson →
            </Link>
          )}
          {data.dueCount > 0 && (
            <Link
              href="/grammar/reviews"
              className="rounded-lg bg-sky-600 px-5 py-2.5 font-medium text-white shadow transition-transform hover:scale-[1.02]"
            >
              Review {data.dueCount} due now →
            </Link>
          )}
        </div>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search grammar points by title or meaning…"
        className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-lg shadow-sm focus:border-sky-500 focus:outline-none"
        lang="ja"
      />

      <GrammarProgressChart points={data.points} />

      {analytics && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-lg font-semibold text-slate-500">Correct Reviews</h2>
            <div className="mt-2 text-4xl font-bold text-slate-800">
              {analytics.correctReviews.pastWeek === null
                ? "—"
                : `${(analytics.correctReviews.pastWeek * 100).toFixed(2)}%`}
            </div>
            <div className="text-sm text-slate-500">Past 7 Days</div>
            <div className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
              Previous Period:{" "}
              <span className="font-bold text-slate-800">
                {analytics.correctReviews.previousWeek === null
                  ? "—"
                  : `${(analytics.correctReviews.previousWeek * 100).toFixed(2)}%`}
              </span>
            </div>
          </section>

          <section className="rounded-xl bg-white p-6 shadow lg:col-span-2">
            <h2 className="mb-4 text-lg font-semibold">Grammar forecast (next 24h)</h2>
            {Object.keys(analytics.forecast).length === 0 ? (
              <p className="text-sm text-slate-500">No grammar reviews scheduled in the next 24 hours.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {Object.entries(analytics.forecast)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([iso, count]) => (
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

          <section className="overflow-hidden rounded-xl bg-white shadow lg:col-span-3">
            <div className="p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <span aria-hidden>🐢</span> Recent Mistakes
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Mistakes from the past 24 hours. Give them some extra love.
              </p>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                {analytics.recentMistakes.length === 0 ? (
                  <>
                    <div
                      aria-disabled
                      className="flex flex-1 cursor-not-allowed items-center justify-between rounded-lg border border-slate-200 px-4 py-3 opacity-50"
                    >
                      <span className="font-semibold text-slate-700">Extra Study</span>
                      <span className="rounded-full border border-slate-300 px-2.5 py-0.5 text-sm text-slate-500">
                        0
                      </span>
                    </div>
                    <div
                      aria-disabled
                      className="flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-3 font-semibold text-slate-700 opacity-50"
                    >
                      Redo Lessons ↺
                    </div>
                  </>
                ) : (
                  <>
                    <Link
                      href="/grammar/reviews?source=mistakes"
                      className="flex flex-1 items-center justify-between rounded-lg border border-slate-200 px-4 py-3 shadow-sm transition-colors hover:bg-slate-50"
                    >
                      <span className="font-semibold text-slate-700">Extra Study</span>
                      <span className="rounded-full border border-slate-300 px-2.5 py-0.5 text-sm text-slate-500">
                        {analytics.recentMistakes.length}
                      </span>
                    </Link>
                    <Link
                      href="/grammar/lessons?source=mistakes"
                      className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-3 font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                    >
                      Redo Lessons ↺
                    </Link>
                  </>
                )}
              </div>
            </div>

            {analytics.recentMistakes.length > 0 && (
              <div className="flex flex-wrap gap-2 bg-slate-100 p-4">
                {analytics.recentMistakes.map((m) => (
                  <Link
                    key={m.grammarPoint.id}
                    href={`/grammar/${encodeURIComponent(m.grammarPoint.slug)}`}
                    className="flex items-center justify-center rounded-lg px-4 py-2 text-lg text-white shadow-sm transition-transform hover:scale-105"
                    style={{ backgroundColor: TYPE_COLORS.grammar }}
                    lang="ja"
                  >
                    {m.grammarPoint.title}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {LEVELS.map((level) => {
        const byLesson = grouped.get(level);
        if (!byLesson || byLesson.size === 0) return null;
        const totalInLevel = data.points.filter((p) => p.jlptLevel === level).length;
        const startedInLevel = data.points.filter(
          (p) => p.jlptLevel === level && p.srsStage !== null,
        ).length;
        const levelOpen = searching || openLevels.has(level);
        const lessonIds = [...byLesson.keys()].sort((a, b) => a - b);

        return (
          <section key={level} className="rounded-xl bg-white shadow">
            <button
              onClick={() => toggleLevel(level)}
              className="flex w-full items-center gap-3 border-b border-slate-100 p-6 pb-4 text-left"
            >
              <span className={`text-slate-400 transition-transform ${levelOpen ? "rotate-90" : ""}`}>
                ›
              </span>
              <h2 className="text-lg font-semibold">
                N{level}{" "}
                <span className="font-normal text-slate-400">
                  · {startedInLevel}/{totalInLevel} started
                </span>
              </h2>
            </button>

            {levelOpen &&
              lessonIds.map((lessonId) => {
                const points = byLesson.get(lessonId)!;
                const lessonOpen = searching || openLessons.has(lessonId);
                const localNum = localLessonNumber.get(lessonId) ?? lessonId;

                return (
                  <div key={lessonId} className="border-b border-slate-100 last:border-b-0">
                    <button
                      onClick={() => toggleLesson(lessonId)}
                      className="flex w-full items-center gap-3 px-6 py-4 text-left hover:bg-slate-50"
                    >
                      <span
                        className={`text-slate-400 transition-transform ${lessonOpen ? "rotate-90" : ""}`}
                      >
                        ›
                      </span>
                      <span className="font-semibold">
                        Lesson {localNum} –{" "}
                        <span className="font-normal text-slate-600">{points[0].lessonDescription}</span>
                      </span>
                    </button>

                    {lessonOpen && (
                      <div className="grid grid-cols-1 gap-3 px-6 pb-6 sm:grid-cols-2 lg:grid-cols-4">
                        {points.map((p, i) => (
                          <Link
                            key={p.id}
                            href={`/grammar/${encodeURIComponent(p.slug)}`}
                            className="rounded-lg border border-slate-200 p-3 shadow-sm transition-colors hover:bg-slate-50"
                          >
                            <p className="truncate text-lg font-medium" lang="ja">
                              {p.title}
                            </p>
                            <p className="truncate text-sm text-slate-500">{p.meaning}</p>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className="text-xs text-slate-400">
                                N{level} Lesson {localNum}: {i + 1}/{points.length}
                              </span>
                              {p.srsStage !== null && (
                                <span
                                  className="shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium text-white"
                                  style={{
                                    backgroundColor: STAGE_GROUP_COLORS[stageGroup(p.srsStage)],
                                  }}
                                >
                                  {STAGE_NAMES[p.srsStage]}
                                </span>
                              )}
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </section>
        );
      })}
    </div>
  );
}

// ---------- Progress chart ----------
// Per-JLPT-level stacked bar: not started / active (Apprentice-Master) / burned,
// same visual language as the main dashboard's Active Item Spread.
function GrammarProgressChart({ points }: { points: GrammarPointRow[] }) {
  const rows = LEVELS.map((level) => {
    const inLevel = points.filter((p) => p.jlptLevel === level);
    const total = inLevel.length;
    const burned = inLevel.filter((p) => p.srsStage === 9).length;
    const active = inLevel.filter((p) => p.srsStage !== null && p.srsStage !== 9).length;
    const guru = inLevel.filter((p) => p.srsStage !== null && p.srsStage >= GURU_STAGE).length;
    return { level, total, active, burned, guru };
  });

  return (
    <section className="rounded-xl bg-white p-6 shadow">
      <h2 className="mb-4 text-lg font-semibold">Progress by level</h2>
      <div className="space-y-3">
        {rows.map((r) => {
          const startedPct = r.total ? ((r.active + r.burned) / r.total) * 100 : 0;
          const burnedPct = r.total ? (r.burned / r.total) * 100 : 0;
          return (
            <div key={r.level} className="flex items-center gap-3">
              <span className="w-8 shrink-0 text-sm font-semibold text-slate-600">N{r.level}</span>
              <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="absolute inset-y-0 left-0"
                  style={{ width: `${startedPct}%`, backgroundColor: TYPE_COLORS.grammar }}
                />
                <div
                  className="absolute inset-y-0 left-0 bg-amber-500"
                  style={{ width: `${burnedPct}%` }}
                />
              </div>
              <span className="w-32 shrink-0 text-right text-sm text-slate-500">
                {r.active + r.burned}/{r.total} started
                {r.guru > 0 && <> · {r.guru} guru+</>}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
