"use client";

// Review session for custom vocabulary. Same quiz mechanics as /reviews
// (meaning + reading + English→reading recall, shared QuizCard and answer
// checking), but sourced from the user's own items and completing against the
// custom-vocab SRS — the WaniKani progression is never touched. Pronunciation
// comes from browser speech synthesis, since custom words have no audio clips.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { QuizCard, type QuizFeedback, type QuizSubject, type TaskKind } from "@/components/QuizCard";
import { SpeechButton } from "@/components/SpeechButton";
import {
  asMeanings,
  asReadings,
  displayCharacters,
  tasksForCustomVocab,
  type CustomVocabDTO,
} from "@/lib/custom-vocab";
import { evaluateAnswer, type RelatedAnswers } from "@/lib/answer-checker";
import { readingWithoutSlots, STAGE_NAMES } from "@/lib/srs";

// The reviews API ships each due item with the user's other same-meaning
// words, for the recall right-word-wrong-card shake.
type ReviewVocabDTO = CustomVocabDTO & { related?: RelatedAnswers };

interface Item {
  vocab: ReviewVocabDTO;
  // the vocab adapted to what QuizCard/checkers expect
  subject: QuizSubject & { related?: RelatedAnswers };
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
  kind: "up" | "down";
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

export default function CustomReviewsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [task, setTask] = useState<{ index: number; kind: TaskKind } | null>(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<QuizFeedback>("idle");
  // WaniKani-style answer-checker messages (see app/reviews/page.tsx).
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const inputCharsRef = useRef("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [completed, setCompleted] = useState(0);
  const [sessionWrong, setSessionWrong] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Show the completion summary briefly, then return to the dashboard.
  const sessionDone = items !== null && items.length > 0 && task === null;
  useEffect(() => {
    if (!sessionDone) return;
    const timer = setTimeout(() => router.push("/"), 3000);
    return () => clearTimeout(timer);
  }, [sessionDone, router]);

  useEffect(() => {
    fetch("/api/custom-vocab/reviews")
      .then((r) => r.json())
      .then((data: { items: ReviewVocabDTO[] }) => {
        const loaded: Item[] = data.items.map((vocab) => {
          const tasks = tasksForCustomVocab(vocab);
          return {
            vocab,
            subject: {
              id: vocab.id,
              type: "custom",
              // A reading-only item is prompted by its reading, so the meaning
              // question reads reading → meaning.
              characters: displayCharacters(vocab),
              characterImage: null,
              meanings: asMeanings(vocab.meanings),
              readings: asReadings(vocab.readings),
              audioUrls: [],
              userSynonyms: [],
              related: vocab.related,
            },
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
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [task, feedback]);

  const submitCompleted = useCallback(async (item: Item) => {
    const res = await fetch("/api/custom-vocab/reviews/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.vocab.id,
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
    if (result.endingStage > result.startingStage) {
      setToast({ text: `↑ ${STAGE_NAMES[result.endingStage]}`, kind: "up" });
    } else if (result.endingStage < result.startingStage) {
      setToast({ text: `↓ ${STAGE_NAMES[result.endingStage]}`, kind: "down" });
    } else {
      // Burned-recall completion: stage never changes.
      setToast({ text: "Recall check complete", kind: "up" });
    }
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Typo forgiveness (same as /reviews): retroactively grade the last
  // "incorrect" answer as a pass — undo the wrong count, mark the sub-question
  // done, and submit the item if this was its last open question.
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
      setCompleted((c) => c + 1);
      void submitCompleted(done);
    }
  }, [items, task, feedback, submitCompleted]);

  const advance = useCallback(() => {
    if (!items || !task) return;
    setFeedback("idle");
    setInput("");
    setRetryMessage(null);
    setInfoMessage(null);
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
      subject: { ...item.subject, auxMeanings: [] },
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
        setCompleted((c) => c + 1);
        void submitCompleted(done);
      }
    } else {
      const updated = [...items];
      updated[task.index] = { ...item, [wrongKey]: item[wrongKey] + 1 };
      setItems(updated);
      setSessionWrong((w) => w + 1);
      setFeedback("incorrect");
    }
  }, [items, task, input, feedback, advance, submitCompleted]);

  if (!items) return <p className="text-slate-500">Loading custom reviews…</p>;

  if (items.length === 0) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow">
        <p className="text-2xl">🎉 No custom reviews due right now.</p>
        <Link href="/custom" className="mt-4 inline-block text-sky-600 hover:underline">
          Back to custom vocabulary
        </Link>
      </div>
    );
  }

  if (!task) {
    const accuracy =
      completed > 0 ? Math.round((completed / (completed + sessionWrong)) * 100) : 100;
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow">
        <h1 className="text-2xl font-bold">Session complete!</h1>
        <p className="mt-2 text-slate-600">
          {completed} items reviewed · {accuracy}% first-guess accuracy
        </p>
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

  const current = items[task.index];
  const subject = current.subject;
  const wantsKana = task.kind === "reading" || task.kind === "recall";
  // A 〜/[hint] slot is a placeholder, not something to pronounce.
  const spokenText =
    readingWithoutSlots(current.vocab.readings[0] ?? "") ||
    readingWithoutSlots(current.vocab.characters ?? "");

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

  return (
    <div className="mx-auto max-w-2xl">
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

      {/* Speech-synthesis pronunciation once the answer is revealed (QuizCard
          only handles WaniKani audio clips, which custom vocab doesn't have). */}
      {(feedback === "correct" || feedback === "incorrect") && (
        <div className="mt-4 flex justify-center">
          <SpeechButton
            key={`${subject.id}-${task.kind}-${feedback}`}
            text={spokenText}
            autoPlay={wantsKana && feedback === "correct"}
          />
        </div>
      )}

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
              ? `Reading: ${current.vocab.readings.join("、")}`
              : `Meaning: ${current.vocab.meanings.join(", ")}`}
          </p>
          {current.vocab.notes && (
            <p className="mt-1 text-slate-500">Note: {current.vocab.notes}</p>
          )}
          <button
            type="button"
            onClick={markCorrect}
            className="mt-3 rounded-lg border border-green-600 px-4 py-1.5 text-green-700 hover:bg-green-50"
          >
            ✓ Mark as correct
          </button>
        </div>
      )}
      {feedback === "correct" && (
        <div className="mt-3 text-center text-sm">
          <p className="text-green-600">Correct! Press Enter to continue.</p>
          {infoMessage && <p className="mt-1 text-slate-500">{infoMessage}</p>}
        </div>
      )}

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
