"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ItemInfoPanel } from "@/components/ItemInfoPanel";
import { QuizCard, type QuizFeedback, type TaskKind } from "@/components/QuizCard";
import { SynonymManager } from "@/components/SynonymManager";
import { evaluateAnswer } from "@/lib/answer-checker";
import { STAGE_NAMES, tasksForSubject } from "@/lib/srs";
import type { SubjectDTO } from "@/lib/serialize";
import { useMistakesMode } from "@/lib/use-mistakes-mode";

type ReviewSubject = SubjectDTO & { srsStage: number };

interface Item {
  subject: ReviewSubject;
  needsReading: boolean;
  needsRecall: boolean;
  meaningDone: boolean;
  readingDone: boolean;
  recallDone: boolean;
  meaningWrong: number;
  readingWrong: number;
  recallWrong: number;
}

interface Toast {
  text: string;
  kind: "up" | "down" | "levelup";
}

function pickTask(items: Item[]): { index: number; kind: TaskKind } | null {
  const open: { index: number; kind: TaskKind }[] = [];
  items.forEach((item, index) => {
    if (!item.meaningDone) open.push({ index, kind: "meaning" });
    if (item.needsReading && !item.readingDone) open.push({ index, kind: "reading" });
    if (item.needsRecall && !item.recallDone) open.push({ index, kind: "recall" });
  });
  if (open.length === 0) return null;
  return open[Math.floor(Math.random() * open.length)];
}

// useMistakesMode reads the URL via useSearchParams, which requires a
// Suspense boundary on a prerendered page (build error without one).
export default function ReviewsPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Loading reviews…</p>}>
      <ReviewsSession />
    </Suspense>
  );
}

function ReviewsSession() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [task, setTask] = useState<{ index: number; kind: TaskKind } | null>(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<QuizFeedback>("idle");
  // WaniKani-style answer-checker messages: the shake hint (shown until the
  // user edits their answer) and the info line under a graded answer.
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const inputCharsRef = useRef("");
  const [showDetails, setShowDetails] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [sessionWrong, setSessionWrong] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // "Extra Study" over recent mistakes: same quiz UI, sourced from the mistake
  // items and — crucially — with no SRS progression on completion.
  const mistakesMode = useMistakesMode();

  useEffect(() => {
    fetch(mistakesMode ? "/api/recent-mistakes" : "/api/reviews")
      .then((r) => r.json())
      .then((data: { subjects: ReviewSubject[] }) => {
        const loaded: Item[] = data.subjects.map((subject) => {
          const tasks = tasksForSubject(subject);
          return {
            subject,
            needsReading: tasks.reading,
            needsRecall: tasks.recall,
            meaningDone: false,
            readingDone: false,
            recallDone: false,
            meaningWrong: 0,
            readingWrong: 0,
            recallWrong: 0,
          };
        });
        setItems(loaded);
        setTask(pickTask(loaded));
      });
  }, [mistakesMode]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [task, feedback]);

  const submitCompleted = useCallback(async (item: Item) => {
    const res = await fetch("/api/reviews/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectId: item.subject.id,
        meaningIncorrectCount: item.meaningWrong,
        readingIncorrectCount: item.readingWrong,
        recallIncorrectCount: item.recallWrong,
      }),
    });
    if (!res.ok) {
      setToast({ text: "Couldn't save that review — it may repeat later.", kind: "down" });
      setTimeout(() => setToast(null), 2500);
      return;
    }
    const result = await res.json();
    if (result.leveledUpTo) {
      setToast({ text: `Level up! You reached level ${result.leveledUpTo} 🎉`, kind: "levelup" });
    } else if (result.endingStage > result.startingStage) {
      setToast({ text: `↑ ${STAGE_NAMES[result.endingStage]}`, kind: "up" });
    } else {
      setToast({ text: `↓ ${STAGE_NAMES[result.endingStage]}`, kind: "down" });
    }
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Typo forgiveness: retroactively grade the last "incorrect" answer as a
  // pass — undo the wrong count, mark the sub-question done, and submit the
  // item if this was its last open question.
  const markCorrect = useCallback(() => {
    if (!items || !task || feedback !== "incorrect") return;
    const doneKey =
      task.kind === "meaning" ? "meaningDone" : task.kind === "reading" ? "readingDone" : "recallDone";
    const wrongKey =
      task.kind === "meaning" ? "meaningWrong" : task.kind === "reading" ? "readingWrong" : "recallWrong";
    const item = items[task.index];
    const done = { ...item, [doneKey]: true, [wrongKey]: Math.max(0, item[wrongKey] - 1) };
    const updated = [...items];
    updated[task.index] = done;
    setItems(updated);
    setSessionWrong((w) => Math.max(0, w - 1));
    setFeedback("correct");
    setInfoMessage(null);
    inputRef.current?.focus();
    if (
      done.meaningDone &&
      (!done.needsReading || done.readingDone) &&
      (!done.needsRecall || done.recallDone)
    ) {
      if (!mistakesMode) void submitCompleted(done);
    }
  }, [items, task, feedback, mistakesMode, submitCompleted]);

  const advance = useCallback(() => {
    if (!items || !task) return;
    setFeedback("idle");
    setInput("");
    setRetryMessage(null);
    setInfoMessage(null);
    setShowDetails(false);
    setTask(pickTask(items));
  }, [items, task]);

  const handleSubmit = useCallback(() => {
    if (!items || !task) return;

    if (feedback === "correct" || feedback === "incorrect") {
      advance();
      return;
    }

    const item = items[task.index];
    // Both "reading" and "recall" are answered with the reading in kana.
    const verdict = evaluateAnswer({
      questionType: task.kind === "meaning" ? "meaning" : "reading",
      recall: task.kind === "recall",
      response: input,
      inputChars: inputCharsRef.current,
      subject: item.subject,
      userSynonyms: item.subject.userSynonyms,
    });

    if (verdict.action === "retry") {
      // Shake and keep the hint up until the answer is edited, like WaniKani.
      setRetryMessage(verdict.message);
      setFeedback("retry");
      return;
    }
    setInfoMessage(verdict.message);

    const doneKey =
      task.kind === "meaning" ? "meaningDone" : task.kind === "reading" ? "readingDone" : "recallDone";
    const wrongKey =
      task.kind === "meaning" ? "meaningWrong" : task.kind === "reading" ? "readingWrong" : "recallWrong";

    if (verdict.action === "pass") {
      const updated = [...items];
      const done = { ...item, [doneKey]: true };
      updated[task.index] = done;
      setItems(updated);
      setFeedback("correct");
      if (
        done.meaningDone &&
        (!done.needsReading || done.readingDone) &&
        (!done.needsRecall || done.recallDone)
      ) {
        // Extra Study is practice only — never advance the SRS stage.
        if (!mistakesMode) void submitCompleted(done);
      }
    } else {
      const updated = [...items];
      updated[task.index] = { ...item, [wrongKey]: item[wrongKey] + 1 };
      setItems(updated);
      setSessionWrong((w) => w + 1);
      setFeedback("incorrect");
    }
  }, [items, task, input, feedback, advance, submitCompleted, mistakesMode]);

  if (!items) return <p className="text-slate-500">Loading reviews…</p>;

  // Each question (meaning / reading / recall) counts as one step of progress.
  const totalSteps = items.reduce(
    (n, it) => n + 1 + (it.needsReading ? 1 : 0) + (it.needsRecall ? 1 : 0),
    0,
  );
  const doneSteps = items.reduce(
    (n, it) =>
      n + (it.meaningDone ? 1 : 0) + (it.readingDone ? 1 : 0) + (it.recallDone ? 1 : 0),
    0,
  );

  if (items.length === 0) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow">
        <p className="text-2xl">
          {mistakesMode ? "🎉 No recent mistakes to study." : "🎉 No reviews due right now."}
        </p>
        <Link href="/" className="mt-4 inline-block text-sky-600 hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (!task) {
    const accuracy =
      totalSteps > 0 ? Math.round((totalSteps / (totalSteps + sessionWrong)) * 100) : 100;
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow">
        <h1 className="text-2xl font-bold">
          {mistakesMode ? "Extra study complete!" : "Session complete!"}
        </h1>
        <p className="mt-2 text-slate-600">
          {items.length} items {mistakesMode ? "studied" : "reviewed"} · {accuracy}% first-guess
          accuracy
        </p>
        {mistakesMode && (
          <p className="mt-1 text-sm text-slate-500">Extra practice only — your SRS was untouched.</p>
        )}
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-sky-600 px-6 py-2 text-white hover:bg-sky-700"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  const current = items[task.index];
  const subject = current.subject;
  // Reading and recall are both answered with the reading in kana.
  const wantsKana = task.kind === "reading" || task.kind === "recall";

  return (
    <div className="mx-auto max-w-2xl">
      {mistakesMode && (
        <div className="mb-4 rounded-lg bg-slate-100 px-4 py-2 text-center text-sm text-slate-600">
          🐢 Extra Study · recent mistakes — answers here don&apos;t affect your SRS.
        </div>
      )}
      <div className="mb-4 flex items-center justify-between text-sm text-slate-500">
        <span>
          {doneSteps} / {totalSteps} done
        </span>
        <span>{sessionWrong} wrong answers this session</span>
      </div>
      <div className="mb-6 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-green-500 transition-all"
          style={{ width: `${(doneSteps / totalSteps) * 100}%` }}
        />
      </div>

      <QuizCard
        subject={subject}
        kind={task.kind}
        input={input}
        onInputChange={(value, inputChars) => {
          setInput(value);
          inputCharsRef.current = inputChars;
          // Editing the answer dismisses the shake hint, like WaniKani.
          if (feedback === "retry") {
            setFeedback("idle");
            setRetryMessage(null);
          }
        }}
        onSubmit={handleSubmit}
        feedback={feedback}
        inputRef={inputRef}
        size="large"
      />

      {feedback === "retry" && retryMessage && (
        <p className="mx-auto mt-3 max-w-md rounded-lg bg-slate-500 px-4 py-2 text-center text-sm text-white shadow">
          {retryMessage}
        </p>
      )}
      {feedback === "incorrect" && (
        <div className="mt-3 rounded-lg bg-red-50 p-4 text-center text-sm">
          <p className="font-medium text-red-700">Incorrect — press Enter to continue.</p>
          <p className="mt-1 text-slate-600">
            {wantsKana
              ? `Reading: ${subject.readings.filter((r) => r.acceptedAnswer).map((r) => r.reading).join(", ")}`
              : `Meaning: ${subject.meanings.filter((m) => m.acceptedAnswer).map((m) => m.meaning).join(", ")}`}
          </p>
          {infoMessage && <p className="mt-1 text-slate-500">{infoMessage}</p>}
          <button
            type="button"
            onClick={markCorrect}
            className="mt-3 rounded-lg border border-green-600 px-4 py-1.5 text-green-700 hover:bg-green-50"
          >
            ✓ Mark as correct
          </button>
          {task.kind === "meaning" && (
            <div className="mt-3 border-t border-red-200 pt-3 text-left">
              <SynonymManager
                key={subject.id}
                subjectId={subject.id}
                initialSynonyms={subject.userSynonyms}
                onChange={(synonyms) => {
                  setItems((prev) => {
                    if (!prev) return prev;
                    const next = [...prev];
                    const it = next[task.index];
                    next[task.index] = {
                      ...it,
                      subject: { ...it.subject, userSynonyms: synonyms },
                    };
                    return next;
                  });
                }}
              />
            </div>
          )}
        </div>
      )}
      {feedback === "correct" && (
        <div className="mt-3 text-center text-sm">
          <p className="text-green-600">Correct! Press Enter to continue.</p>
          {infoMessage && <p className="mt-1 text-slate-500">{infoMessage}</p>}
        </div>
      )}
      {(feedback === "correct" || feedback === "incorrect") && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              setShowDetails((s) => !s);
              // Keep Enter-to-continue working after the click moves focus.
              inputRef.current?.focus();
            }}
            className="mx-auto block text-sm text-sky-600 hover:underline"
          >
            {showDetails ? "Hide item info" : "Show item info"}
          </button>
          {showDetails && (
            <div className="mt-2">
              <ItemInfoPanel subject={subject} />
            </div>
          )}
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 rounded-lg px-4 py-2 text-white shadow-lg ${
            toast.kind === "levelup"
              ? "bg-amber-500"
              : toast.kind === "up"
                ? "bg-green-600"
                : "bg-slate-600"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
