"use client";

import { useState } from "react";

interface Msg {
  ok: boolean;
  text: string;
}

// Lets the user tune how many new lessons (kanji/vocab and grammar) start per
// day, and whether each batch mixes item types — see the DEFAULT_* constants
// in lib/progression.ts, persisted per-user on UserProgress.

export function LessonPacingForm({
  initialDailyLessonLimit,
  initialGrammarDailyLessonLimit,
  initialInterleaveLessons,
}: {
  initialDailyLessonLimit: number;
  initialGrammarDailyLessonLimit: number;
  initialInterleaveLessons: boolean;
}) {
  const [dailyLessonLimit, setDailyLessonLimit] = useState(String(initialDailyLessonLimit));
  const [grammarDailyLessonLimit, setGrammarDailyLessonLimit] = useState(
    String(initialGrammarDailyLessonLimit),
  );
  const [interleaveLessons, setInterleaveLessons] = useState(initialInterleaveLessons);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // Number("") is 0, so an empty field must be rejected before conversion —
    // it would otherwise save a 0 limit and silently disable lessons.
    const daily = dailyLessonLimit.trim() === "" ? NaN : Number(dailyLessonLimit);
    const grammar = grammarDailyLessonLimit.trim() === "" ? NaN : Number(grammarDailyLessonLimit);
    if (!Number.isInteger(daily) || !Number.isInteger(grammar) || daily < 1 || grammar < 1) {
      setMsg({ ok: false, text: "Both values must be whole numbers of at least 1" });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyLessonLimit: daily,
          grammarDailyLessonLimit: grammar,
          interleaveLessons,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: data?.error ?? "Could not save settings" });
        return;
      }
      setDailyLessonLimit(String(data.dailyLessonLimit));
      setGrammarDailyLessonLimit(String(data.grammarDailyLessonLimit));
      setInterleaveLessons(data.interleaveLessons);
      setMsg({ ok: true, text: "Saved" });
    } catch {
      setMsg({ ok: false, text: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl bg-white p-6 shadow">
      <h2 className="text-lg font-semibold text-slate-900">Lesson pacing</h2>
      <p className="mt-1 text-sm text-slate-500">
        How many new lessons start per day before you have to opt in to an extra batch.
      </p>

      <form onSubmit={save} className="mt-4 space-y-3">
        <div className="flex items-center gap-3">
          <label
            className="w-40 text-sm font-medium text-slate-700"
            htmlFor="daily-lesson-limit"
          >
            Kanji lessons/day
          </label>
          <input
            id="daily-lesson-limit"
            type="number"
            min={1}
            max={200}
            value={dailyLessonLimit}
            onChange={(e) => setDailyLessonLimit(e.target.value)}
            className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </div>
        <div className="flex items-center gap-3">
          <label
            className="w-40 text-sm font-medium text-slate-700"
            htmlFor="grammar-daily-lesson-limit"
          >
            Grammar lessons/day
          </label>
          <input
            id="grammar-daily-lesson-limit"
            type="number"
            min={1}
            max={200}
            value={grammarDailyLessonLimit}
            onChange={(e) => setGrammarDailyLessonLimit(e.target.value)}
            className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </div>
        <div className="flex items-start gap-3 pt-1">
          <input
            id="interleave-lessons"
            type="checkbox"
            checked={interleaveLessons}
            onChange={(e) => setInterleaveLessons(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
          />
          <label htmlFor="interleave-lessons" className="text-sm text-slate-700">
            <span className="font-medium">Interleave lessons</span>
            <span className="mt-0.5 block text-slate-500">
              Mix radicals, kanji and vocabulary in every batch. With this off, a
              level&apos;s radicals all come first — level 4 has 36, so they can fill
              several days of lessons before the first kanji.
            </span>
          </label>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {msg && (
          <p className={`text-sm ${msg.ok ? "text-cyan-700" : "text-red-600"}`}>{msg.text}</p>
        )}
      </form>
    </section>
  );
}
