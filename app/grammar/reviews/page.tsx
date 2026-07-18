"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { GrammarQuizCard, type GrammarFeedback } from "@/components/GrammarQuizCard";
import { checkGrammarAnswer } from "@/lib/grammar-answer-checker";
import type { GrammarPointDTO, GrammarSentenceDTO } from "@/lib/grammar";
import { STAGE_NAMES } from "@/lib/srs";
import { useMistakesMode } from "@/lib/use-mistakes-mode";

interface ReviewItem {
  grammarPoint: GrammarPointDTO;
  sentence: GrammarSentenceDTO;
  srsStage: number;
}

interface Item {
  data: ReviewItem;
  missed: boolean; // any wrong attempt before the correct retype this round
  done: boolean;
}

interface Toast {
  text: string;
  kind: "up" | "down";
}

function pickIndex(items: Item[]): number | null {
  const open = items.map((it, i) => (it.done ? -1 : i)).filter((i) => i >= 0);
  if (open.length === 0) return null;
  return open[Math.floor(Math.random() * open.length)];
}

// useMistakesMode reads the URL via useSearchParams, which requires a
// Suspense boundary on a prerendered page (build error without one).
export default function GrammarReviewsPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Loading reviews…</p>}>
      <GrammarReviewsSession />
    </Suspense>
  );
}

function GrammarReviewsSession() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [index, setIndex] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<GrammarFeedback>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [completed, setCompleted] = useState(0);
  const [sessionWrong, setSessionWrong] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // "Extra Study" over recent mistakes: same quiz UI, sourced from the mistake
  // items and — crucially — with no SRS progression on completion.
  const mistakesMode = useMistakesMode();
  const router = useRouter();

  // Show the completion summary briefly, then return to the dashboard.
  const sessionDone = items !== null && items.length > 0 && index === null;
  useEffect(() => {
    if (!sessionDone) return;
    const timer = setTimeout(() => router.push("/"), 3000);
    return () => clearTimeout(timer);
  }, [sessionDone, router]);

  useEffect(() => {
    fetch(mistakesMode ? "/api/grammar/recent-mistakes" : "/api/grammar/reviews")
      .then((r) => r.json())
      .then((data: { items: ReviewItem[] }) => {
        const loaded: Item[] = data.items.map((entry) => ({
          data: entry,
          missed: false,
          done: false,
        }));
        setItems(loaded);
        setIndex(pickIndex(loaded));
      });
  }, [mistakesMode]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [index, feedback]);

  const submitCompleted = useCallback(async (item: Item) => {
    const res = await fetch("/api/grammar/reviews/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grammarPointId: item.data.grammarPoint.id,
        incorrectCount: item.missed ? 1 : 0,
      }),
    });
    if (!res.ok) {
      setToast({ text: "Couldn't save that review — it may repeat later.", kind: "down" });
      setTimeout(() => setToast(null), 2500);
      return;
    }
    const result = await res.json();
    if (result.endingStage > result.startingStage) {
      setToast({ text: `↑ ${STAGE_NAMES[result.endingStage]}`, kind: "up" });
    } else {
      setToast({ text: `↓ ${STAGE_NAMES[result.endingStage]}`, kind: "down" });
    }
    setTimeout(() => setToast(null), 2500);
  }, []);

  const advance = useCallback(() => {
    if (!items) return;
    setFeedback("idle");
    setNotice(null);
    setInput("");
    setIndex(pickIndex(items));
  }, [items]);

  const handleSubmit = useCallback(() => {
    if (!items || index === null) return;
    const item = items[index];

    if (feedback === "correct") {
      advance();
      return;
    }

    const verdict = checkGrammarAnswer(
      input,
      item.data.sentence.acceptedAnswers,
      item.data.sentence.wrongAnswerHints,
    );

    if (verdict.action === "retry") {
      // Shake and keep the hint up until the answer is edited — but if the
      // answer is already revealed (an empty Enter after a miss), keep showing
      // it: the user still has to retype it, so hiding it now would defeat
      // reveal+retype. A meaning-equivalent wrong form lands here too (with
      // its hint as the message), not in the fail branch — it doesn't count
      // as a miss. In the revealed state the empty-input nudge is dropped
      // (the red banner already says to retype) but a real hint still shows.
      setNotice(item.missed && !input.trim() ? null : verdict.message);
      setFeedback(item.missed ? "revealed" : "retry");
      return;
    }

    if (verdict.action === "pass") {
      const updated = [...items];
      const done = { ...item, done: true };
      updated[index] = done;
      setItems(updated);
      setInput("");
      setFeedback("correct");
      setCompleted((c) => c + 1);
      // Extra Study is practice only — never advance the SRS stage.
      if (!mistakesMode) void submitCompleted(done);
    } else {
      // Reveal+retype: mark the miss (counted once, however many failed
      // retypes follow) and clear the input, but stay on this item.
      const updated = [...items];
      updated[index] = { ...item, missed: true };
      setItems(updated);
      setSessionWrong((w) => w + 1);
      setInput("");
      setFeedback("revealed");
    }
  }, [items, index, input, feedback, advance, submitCompleted, mistakesMode]);

  if (!items) return <p className="text-slate-500">Loading reviews…</p>;

  if (items.length === 0) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow">
        <p className="text-2xl">
          {mistakesMode
            ? "🎉 No recent grammar mistakes to study."
            : "🎉 No grammar reviews due right now."}
        </p>
        <Link href="/grammar" className="mt-4 inline-block text-sky-600 hover:underline">
          Back to grammar
        </Link>
      </div>
    );
  }

  if (index === null) {
    // First-guess accuracy: items answered correctly before any reveal. The
    // per-submission sessionWrong counter would overweigh failed retypes.
    const firstGuessCorrect = items.filter((it) => !it.missed).length;
    const accuracy = Math.round((firstGuessCorrect / items.length) * 100);
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow">
        <h1 className="text-2xl font-bold">
          {mistakesMode ? "Extra study complete!" : "Session complete!"}
        </h1>
        <p className="mt-2 text-slate-600">
          {items.length} points {mistakesMode ? "studied" : "reviewed"} · {accuracy}% first-guess
          accuracy
        </p>
        {mistakesMode && (
          <p className="mt-1 text-sm text-slate-500">
            Extra practice only — your SRS was untouched.
          </p>
        )}
        <p className="mt-4 text-sm text-slate-400">Returning to the dashboard…</p>
        <Link
          href="/"
          className="mt-3 inline-block rounded-lg bg-sky-600 px-6 py-2 text-white hover:bg-sky-700"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  const current = items[index];

  return (
    <div className="mx-auto max-w-2xl">
      {mistakesMode && (
        <div className="mb-4 rounded-lg bg-slate-100 px-4 py-2 text-center text-sm text-slate-600">
          🐢 Extra Study · recent mistakes — answers here don&apos;t affect your SRS.
        </div>
      )}
      <div className="mb-4 flex items-center justify-between text-sm text-slate-500">
        <span>
          {completed} / {items.length} done
        </span>
        <span>{sessionWrong} wrong answers this session</span>
      </div>
      <div className="mb-6 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-green-500 transition-all"
          style={{ width: `${(completed / items.length) * 100}%` }}
        />
      </div>

      <GrammarQuizCard
        sentence={current.data.sentence}
        input={input}
        onInputChange={(value) => {
          setInput(value);
          setNotice(null);
          if (feedback === "retry") setFeedback("idle");
        }}
        onSubmit={handleSubmit}
        feedback={feedback}
        notice={notice}
        inputRef={inputRef}
      />

      {toast && (
        <div
          className={`fixed bottom-6 right-6 rounded-lg px-4 py-2 text-white shadow-lg ${
            toast.kind === "up" ? "bg-green-600" : "bg-slate-600"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
