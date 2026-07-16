"use client";

import { useState } from "react";

interface Msg {
  ok: boolean;
  text: string;
}

// Lets the user tune how many new lessons (kanji/vocab and grammar) start per
// day — see DEFAULT_DAILY_LESSON_LIMIT/DEFAULT_GRAMMAR_DAILY_LESSON_LIMIT in
// lib/progression.ts, persisted per-user on UserProgress.

export function LessonPacingForm({
  initialDailyLessonLimit,
  initialGrammarDailyLessonLimit,
}: {
  initialDailyLessonLimit: number;
  initialGrammarDailyLessonLimit: number;
}) {
  const [dailyLessonLimit, setDailyLessonLimit] = useState(String(initialDailyLessonLimit));
  const [grammarDailyLessonLimit, setGrammarDailyLessonLimit] = useState(
    String(initialGrammarDailyLessonLimit),
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const daily = Number(dailyLessonLimit);
    const grammar = Number(grammarDailyLessonLimit);
    if (!Number.isInteger(daily) || !Number.isInteger(grammar)) {
      setMsg({ ok: false, text: "Both values must be whole numbers" });
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
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: data?.error ?? "Could not save settings" });
        return;
      }
      setDailyLessonLimit(String(data.dailyLessonLimit));
      setGrammarDailyLessonLimit(String(data.grammarDailyLessonLimit));
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
