"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import * as wanakana from "wanakana";
import { MnemonicText } from "@/components/MnemonicText";
import { SubjectChar } from "@/components/SubjectChar";
import { checkMeaning, checkReading } from "@/lib/srs";
import type { SubjectDTO } from "@/lib/serialize";
import { TYPE_COLORS, TYPE_LABELS } from "@/lib/ui";

type Phase = "loading" | "learn" | "quiz" | "empty" | "limit";
type TaskKind = "meaning" | "reading";

interface QuizTask {
  subject: SubjectDTO;
  kind: TaskKind;
}

function buildQuizTasks(subjects: SubjectDTO[]): QuizTask[] {
  const tasks: QuizTask[] = [];
  for (const subject of subjects) {
    tasks.push({ subject, kind: "meaning" });
    if (subject.type !== "radical" && subject.readings.some((r) => r.acceptedAnswer)) {
      tasks.push({ subject, kind: "reading" });
    }
  }
  // shuffle
  for (let i = tasks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
  }
  return tasks;
}

export default function LessonsPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [subjects, setSubjects] = useState<SubjectDTO[]>([]);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [slide, setSlide] = useState(0);
  const [quiz, setQuiz] = useState<QuizTask[]>([]);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<"idle" | "correct" | "incorrect" | "retry">("idle");
  const [doneToday, setDoneToday] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(10);
  const [extraBatchSize, setExtraBatchSize] = useState(5);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback((extra = false) => {
    setPhase("loading");
    fetch(extra ? "/api/lessons?extra=1" : "/api/lessons?limit=5")
      .then((r) => r.json())
      .then(
        (data: {
          total: number;
          doneToday: number;
          dailyLimit: number;
          extraBatchSize: number;
          subjects: SubjectDTO[];
        }) => {
          setTotalAvailable(data.total);
          setDoneToday(data.doneToday);
          setDailyLimit(data.dailyLimit);
          setExtraBatchSize(data.extraBatchSize);
          setSubjects(data.subjects);
          setSlide(0);
          setInput("");
          setFeedback("idle");
          if (data.subjects.length > 0) setPhase("learn");
          else if (data.total > 0) setPhase("limit");
          else setPhase("empty");
        },
      );
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    if (phase === "quiz") inputRef.current?.focus();
  }, [phase, quiz, feedback]);

  const startQuiz = () => {
    setQuiz(buildQuizTasks(subjects));
    setPhase("quiz");
  };

  const finishBatch = useCallback(async () => {
    await fetch("/api/lessons/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectIds: subjects.map((s) => s.id) }),
    });
    load();
  }, [subjects, load]);

  const handleQuizSubmit = useCallback(() => {
    const task = quiz[0];
    if (!task) return;

    if (feedback === "correct") {
      const rest = quiz.slice(1);
      setQuiz(rest);
      setInput("");
      setFeedback("idle");
      if (rest.length === 0) void finishBatch();
      return;
    }
    if (feedback === "incorrect") {
      // requeue the missed task at the back
      setQuiz([...quiz.slice(1), task]);
      setInput("");
      setFeedback("idle");
      return;
    }

    const result =
      task.kind === "meaning"
        ? checkMeaning(input, task.subject.meanings, task.subject.auxMeanings)
        : checkReading(input, task.subject.readings);

    if (result === "retry") {
      setFeedback("retry");
      setTimeout(() => setFeedback("idle"), 900);
    } else {
      setFeedback(result);
    }
  }, [quiz, input, feedback, finishBatch]);

  if (phase === "loading") return <p className="text-slate-500">Loading lessons…</p>;

  if (phase === "empty") {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow">
        <p className="text-2xl">No lessons available right now.</p>
        <p className="mt-2 text-slate-500">
          Do your reviews to unlock more items.
        </p>
        <Link href="/" className="mt-4 inline-block text-sky-600 hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (phase === "limit") {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow">
        <p className="text-2xl">You’ve finished your {dailyLimit} lessons for today. 🎉</p>
        <p className="mt-2 text-slate-500">
          {doneToday} done today · {totalAvailable} more waiting in the queue.
        </p>
        <button
          onClick={() => load(true)}
          className="mt-6 rounded-lg bg-pink-600 px-6 py-3 text-white hover:bg-pink-700"
        >
          Do {extraBatchSize} more lessons
        </button>
        <div className="mt-4">
          <Link href="/" className="text-sky-600 hover:underline">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "learn") {
    const subject = subjects[slide];
    const color = TYPE_COLORS[subject.type];
    const acceptedReadings = subject.readings.filter((r) => r.acceptedAnswer);
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            Lesson {slide + 1} / {subjects.length}
          </span>
          <span>{totalAvailable} lessons in queue</span>
        </div>

        <div className="overflow-hidden rounded-xl bg-white shadow">
          <div
            className="flex min-h-40 items-center justify-center p-8 text-white"
            style={{ backgroundColor: color }}
          >
            <SubjectChar
              characters={subject.characters}
              characterImage={subject.characterImage}
              className="text-7xl font-medium"
            />
          </div>
          <div className="space-y-5 p-6">
            <div>
              <span
                className="rounded px-2 py-0.5 text-xs font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                {TYPE_LABELS[subject.type]} · Level {subject.level}
              </span>
            </div>

            <section>
              <h2 className="text-sm font-semibold uppercase text-slate-400">Meaning</h2>
              <p className="text-xl font-medium">
                {subject.meanings.filter((m) => m.acceptedAnswer).map((m) => m.meaning).join(", ")}
              </p>
              {subject.mnemonicImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={subject.mnemonicImage}
                  alt={`${TYPE_LABELS[subject.type]} mnemonic`}
                  className="mx-auto my-3 max-h-56 rounded-lg border border-slate-200"
                />
              )}
              <div className="mt-2 text-slate-700">
                <MnemonicText text={subject.meaningMnemonic} />
              </div>
              {subject.meaningHint && (
                <p className="mt-2 rounded bg-slate-50 p-2 text-sm text-slate-500">
                  Hint: {subject.meaningHint}
                </p>
              )}
            </section>

            {acceptedReadings.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase text-slate-400">Reading</h2>
                <p className="text-xl font-medium">
                  {acceptedReadings.map((r) => r.reading).join("、")}
                </p>
                {subject.readingMnemonic && (
                  <div className="mt-2 text-slate-700">
                    <MnemonicText text={subject.readingMnemonic} />
                  </div>
                )}
              </section>
            )}

            {subject.contextSentences.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase text-slate-400">
                  Context sentences
                </h2>
                {subject.contextSentences.slice(0, 2).map((s, i) => (
                  <p key={i} className="mt-1 text-sm">
                    <span lang="ja">{s.ja}</span>
                    <br />
                    <span className="text-slate-500">{s.en}</span>
                  </p>
                ))}
              </section>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-between">
          <button
            onClick={() => setSlide((s) => Math.max(0, s - 1))}
            disabled={slide === 0}
            className="rounded-lg bg-slate-200 px-5 py-2 disabled:opacity-40"
          >
            ← Back
          </button>
          {slide < subjects.length - 1 ? (
            <button
              onClick={() => setSlide((s) => s + 1)}
              className="rounded-lg bg-sky-600 px-5 py-2 text-white hover:bg-sky-700"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={startQuiz}
              className="rounded-lg bg-pink-600 px-5 py-2 text-white hover:bg-pink-700"
            >
              Start quiz
            </button>
          )}
        </div>
      </div>
    );
  }

  // phase === "quiz"
  const task = quiz[0];
  if (!task) return <p className="text-slate-500">Saving…</p>;
  const isReading = task.kind === "reading";
  const color = TYPE_COLORS[task.subject.type];

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-4 text-sm text-slate-500">
        Quiz: answer every item correctly to finish the batch ({quiz.length} prompts left)
      </p>
      <div className="overflow-hidden rounded-xl shadow">
        <div
          className="flex min-h-40 items-center justify-center p-8 text-white"
          style={{ backgroundColor: color }}
        >
          <SubjectChar
            characters={task.subject.characters}
            characterImage={task.subject.characterImage}
            className="text-6xl font-medium"
          />
        </div>
        <div className="bg-slate-800 py-2 text-center text-sm text-white">
          {TYPE_LABELS[task.subject.type]}{" "}
          <span className="font-bold">{isReading ? "Reading" : "Meaning"}</span>
        </div>
        <div
          className={`border-t-4 ${
            feedback === "correct"
              ? "border-green-400 bg-green-100"
              : feedback === "incorrect"
                ? "border-red-400 bg-red-100"
                : feedback === "retry"
                  ? "animate-pulse border-amber-400 bg-amber-50"
                  : "border-slate-300 bg-white"
          }`}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => {
              const raw = e.target.value;
              setInput(isReading ? wanakana.toKana(raw, { IMEMode: true }) : raw);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleQuizSubmit()}
            placeholder={isReading ? "答え (kana)" : "Your answer (English)"}
            className="w-full bg-transparent p-4 text-center text-xl outline-none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      </div>
      {feedback === "incorrect" && (
        <p className="mt-3 text-center text-sm text-red-600">
          Not quite —{" "}
          {isReading
            ? task.subject.readings.filter((r) => r.acceptedAnswer).map((r) => r.reading).join(", ")
            : task.subject.meanings.filter((m) => m.acceptedAnswer).map((m) => m.meaning).join(", ")}
          . Press Enter; it will come around again.
        </p>
      )}
      {feedback === "correct" && (
        <p className="mt-3 text-center text-sm text-green-600">Correct! Press Enter.</p>
      )}
    </div>
  );
}
