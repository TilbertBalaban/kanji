"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import * as wanakana from "wanakana";
import { SubjectChar } from "@/components/SubjectChar";
import { checkMeaning, checkReading, STAGE_NAMES } from "@/lib/srs";
import type { SubjectDTO } from "@/lib/serialize";
import { TYPE_COLORS, TYPE_LABELS } from "@/lib/ui";

type ReviewSubject = SubjectDTO & { srsStage: number };
type TaskKind = "meaning" | "reading";

interface Item {
  subject: ReviewSubject;
  needsReading: boolean;
  meaningDone: boolean;
  readingDone: boolean;
  meaningWrong: number;
  readingWrong: number;
}

interface Toast {
  text: string;
  kind: "up" | "down" | "levelup";
}

function hasReadingTask(s: ReviewSubject): boolean {
  return s.type !== "radical" && s.readings.some((r) => r.acceptedAnswer);
}

function pickTask(items: Item[]): { index: number; kind: TaskKind } | null {
  const open: { index: number; kind: TaskKind }[] = [];
  items.forEach((item, index) => {
    if (!item.meaningDone) open.push({ index, kind: "meaning" });
    if (item.needsReading && !item.readingDone) open.push({ index, kind: "reading" });
  });
  if (open.length === 0) return null;
  return open[Math.floor(Math.random() * open.length)];
}

export default function ReviewsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [task, setTask] = useState<{ index: number; kind: TaskKind } | null>(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<"idle" | "correct" | "incorrect" | "retry">("idle");
  const [toast, setToast] = useState<Toast | null>(null);
  const [completed, setCompleted] = useState(0);
  const [sessionWrong, setSessionWrong] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/reviews")
      .then((r) => r.json())
      .then((data: { subjects: ReviewSubject[] }) => {
        const loaded: Item[] = data.subjects.map((subject) => ({
          subject,
          needsReading: hasReadingTask(subject),
          meaningDone: false,
          readingDone: false,
          meaningWrong: 0,
          readingWrong: 0,
        }));
        setItems(loaded);
        setTask(pickTask(loaded));
      });
  }, []);

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
      }),
    });
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

  const advance = useCallback(() => {
    if (!items || !task) return;
    setFeedback("idle");
    setInput("");
    setTask(pickTask(items));
  }, [items, task]);

  const handleSubmit = useCallback(() => {
    if (!items || !task) return;

    if (feedback === "correct" || feedback === "incorrect") {
      advance();
      return;
    }

    const item = items[task.index];
    const result =
      task.kind === "meaning"
        ? checkMeaning(input, item.subject.meanings, item.subject.auxMeanings)
        : checkReading(input, item.subject.readings);

    if (result === "retry") {
      setFeedback("retry");
      setTimeout(() => setFeedback("idle"), 900);
      return;
    }

    if (result === "correct") {
      const updated = [...items];
      const done = { ...item, [task.kind === "meaning" ? "meaningDone" : "readingDone"]: true };
      updated[task.index] = done;
      setItems(updated);
      setFeedback("correct");
      if (done.meaningDone && (!done.needsReading || done.readingDone)) {
        setCompleted((c) => c + 1);
        void submitCompleted(done);
      }
    } else {
      const updated = [...items];
      updated[task.index] = {
        ...item,
        [task.kind === "meaning" ? "meaningWrong" : "readingWrong"]:
          (task.kind === "meaning" ? item.meaningWrong : item.readingWrong) + 1,
      };
      setItems(updated);
      setSessionWrong((w) => w + 1);
      setFeedback("incorrect");
    }
  }, [items, task, input, feedback, advance, submitCompleted]);

  if (!items) return <p className="text-slate-500">Loading reviews…</p>;

  if (items.length === 0) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow">
        <p className="text-2xl">🎉 No reviews due right now.</p>
        <Link href="/" className="mt-4 inline-block text-sky-600 hover:underline">
          Back to dashboard
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
  const color = TYPE_COLORS[subject.type];
  const isReading = task.kind === "reading";

  const feedbackClasses =
    feedback === "correct"
      ? "bg-green-100 border-green-400"
      : feedback === "incorrect"
        ? "bg-red-100 border-red-400"
        : feedback === "retry"
          ? "bg-amber-50 border-amber-400 animate-pulse"
          : "bg-white border-slate-300";

  return (
    <div className="mx-auto max-w-2xl">
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

      <div className="overflow-hidden rounded-xl shadow">
        <div
          className="flex min-h-48 items-center justify-center p-8 text-white"
          style={{ backgroundColor: color }}
        >
          <SubjectChar
            characters={subject.characters}
            characterImage={subject.characterImage}
            className="text-7xl font-medium"
          />
        </div>
        <div className="bg-slate-800 py-2 text-center text-sm text-white">
          {TYPE_LABELS[subject.type]}{" "}
          <span className="font-bold">{isReading ? "Reading" : "Meaning"}</span>
        </div>
        <div className={`border-t-4 transition-colors ${feedbackClasses}`}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => {
              const raw = e.target.value;
              setInput(isReading ? wanakana.toKana(raw, { IMEMode: true }) : raw);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder={isReading ? "答え (kana)" : "Your answer (English)"}
            className="w-full bg-transparent p-4 text-center text-xl outline-none"
            lang={isReading ? "ja" : "en"}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            readOnly={feedback === "correct" || feedback === "incorrect"}
          />
        </div>
      </div>

      {feedback === "retry" && (
        <p className="mt-3 text-center text-sm text-amber-600">
          That reading exists, but it&apos;s not the one we&apos;re looking for — try another.
        </p>
      )}
      {feedback === "incorrect" && (
        <div className="mt-3 rounded-lg bg-red-50 p-4 text-center text-sm">
          <p className="font-medium text-red-700">Incorrect — press Enter to continue.</p>
          <p className="mt-1 text-slate-600">
            {isReading
              ? `Reading: ${subject.readings.filter((r) => r.acceptedAnswer).map((r) => r.reading).join(", ")}`
              : `Meaning: ${subject.meanings.filter((m) => m.acceptedAnswer).map((m) => m.meaning).join(", ")}`}
          </p>
          <Link
            href={`/subjects/${subject.id}`}
            target="_blank"
            className="mt-1 inline-block text-sky-600 hover:underline"
          >
            View item details
          </Link>
        </div>
      )}
      {feedback === "correct" && (
        <p className="mt-3 text-center text-sm text-green-600">
          Correct! Press Enter to continue.
        </p>
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
