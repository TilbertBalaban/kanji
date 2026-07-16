"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { GrammarQuizCard, type GrammarFeedback } from "@/components/GrammarQuizCard";
import { AboutExamples, GrammarRelations, SentenceCard } from "@/components/GrammarPointInfo";
import { checkGrammarAnswer } from "@/lib/grammar-answer-checker";
import type { GrammarPointDTO, GrammarRelationDTO, GrammarSentenceDTO } from "@/lib/grammar";
import { TYPE_COLORS } from "@/lib/ui";
import { useMistakesMode } from "@/lib/use-mistakes-mode";

type Phase = "loading" | "learn" | "quiz" | "empty" | "limit" | "done";

interface LessonPoint extends GrammarPointDTO {
  sentences: GrammarSentenceDTO[];
  // Absent in Redo-Lessons mode (recent-mistakes source doesn't fetch these).
  relations?: GrammarRelationDTO[];
}

interface QuizTask {
  point: LessonPoint;
  sentence: GrammarSentenceDTO;
  missed: boolean;
}

function buildQuizTasks(points: LessonPoint[]): QuizTask[] {
  const tasks = points
    .filter((p) => p.sentences.length > 0)
    .map((p) => ({ point: p, sentence: p.sentences[0], missed: false }));
  for (let i = tasks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
  }
  return tasks;
}

// useMistakesMode reads the URL via useSearchParams, which requires a
// Suspense boundary on a prerendered page (build error without one).
export default function GrammarLessonsPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Loading…</p>}>
      <GrammarLessonsSession />
    </Suspense>
  );
}

function GrammarLessonsSession() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [points, setPoints] = useState<LessonPoint[]>([]);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [slide, setSlide] = useState(0);
  const [quiz, setQuiz] = useState<QuizTask[]>([]);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<GrammarFeedback>("idle");
  const [doneToday, setDoneToday] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(10);
  const [extraBatchSize, setExtraBatchSize] = useState(5);
  const inputRef = useRef<HTMLInputElement>(null);

  // "Redo Lessons" over recent mistakes: re-teach the point + quiz for points
  // missed in the past 24h, with no daily-limit gating and no SRS change.
  const mistakesMode = useMistakesMode();
  // ?extra=1 lets a link (dashboard tile, /grammar header) jump straight into
  // an opt-in extra batch instead of the regular daily-limited one.
  const startExtra = useSearchParams().get("extra") === "1";

  const load = useCallback((extra = false) => {
    setPhase("loading");
    if (mistakesMode) {
      fetch("/api/grammar/recent-mistakes")
        .then((r) => r.json())
        .then((data: { items: { grammarPoint: GrammarPointDTO; sentence: GrammarSentenceDTO }[] }) => {
          const loaded = data.items.map((it) => ({ ...it.grammarPoint, sentences: [it.sentence] }));
          setTotalAvailable(loaded.length);
          setPoints(loaded);
          setSlide(0);
          setInput("");
          setFeedback("idle");
          setPhase(loaded.length > 0 ? "learn" : "empty");
        });
      return;
    }
    fetch(extra ? "/api/grammar/lessons?extra=1" : "/api/grammar/lessons?limit=5")
      .then((r) => r.json())
      .then(
        (data: {
          total: number;
          doneToday: number;
          dailyLimit: number;
          extraBatchSize: number;
          points: LessonPoint[];
        }) => {
          setTotalAvailable(data.total);
          setDoneToday(data.doneToday);
          setDailyLimit(data.dailyLimit);
          setExtraBatchSize(data.extraBatchSize);
          setPoints(data.points);
          setSlide(0);
          setInput("");
          setFeedback("idle");
          if (data.points.length > 0) setPhase("learn");
          else if (data.total > 0) setPhase("limit");
          else setPhase("empty");
        },
      );
  }, [mistakesMode]);

  useEffect(() => load(startExtra), [load, startExtra]);

  useEffect(() => {
    if (phase === "quiz") inputRef.current?.focus();
  }, [phase, quiz, feedback]);

  const startQuiz = () => {
    setQuiz(buildQuizTasks(points));
    setPhase("quiz");
  };

  const finishBatch = useCallback(async () => {
    // Redo is practice only — don't start/advance any SRS progress.
    if (mistakesMode) {
      setPhase("done");
      return;
    }
    await fetch("/api/grammar/lessons/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grammarPointIds: points.map((p) => p.id) }),
    });
    load();
  }, [points, load, mistakesMode]);

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

    const verdict = checkGrammarAnswer(input, task.sentence.acceptedAnswers);

    if (verdict.action === "retry") {
      // An empty Enter after a miss must not hide the revealed answer — the
      // user still has to retype it (see the reviews page).
      setFeedback(task.missed ? "revealed" : "retry");
      return;
    }
    if (verdict.action === "pass") {
      setFeedback("correct");
    } else {
      // Reveal+retype — the teaching moment. Stay on this task; the miss is
      // remembered on the task itself (though lesson quizzes never affect SRS).
      setQuiz([{ ...task, missed: true }, ...quiz.slice(1)]);
      setInput("");
      setFeedback("revealed");
    }
  }, [quiz, input, feedback, finishBatch]);

  if (phase === "loading") return <p className="text-slate-500">Loading lessons…</p>;

  if (phase === "empty") {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow">
        <p className="text-2xl">
          {mistakesMode ? "🎉 No recent grammar mistakes to redo." : "No grammar lessons available right now."}
        </p>
        <p className="mt-2 text-slate-500">
          {mistakesMode
            ? "Nothing missed in the past 24 hours."
            : "You've started every grammar point on the path so far."}
        </p>
        <Link href="/grammar" className="mt-4 inline-block text-sky-600 hover:underline">
          Back to grammar
        </Link>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow">
        <p className="text-2xl">Nice — you redid your recent grammar mistakes! 🎉</p>
        <p className="mt-2 text-slate-500">Extra practice only — your SRS wasn&apos;t affected.</p>
        <Link href="/grammar" className="mt-4 inline-block text-sky-600 hover:underline">
          Back to grammar
        </Link>
      </div>
    );
  }

  if (phase === "limit") {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow">
        <p className="text-2xl">You’ve finished your {dailyLimit} grammar lessons for today. 🎉</p>
        <p className="mt-2 text-slate-500">
          {doneToday} done today · {totalAvailable} more waiting on the path.
        </p>
        <button
          onClick={() => load(true)}
          className="mt-6 rounded-lg px-6 py-3 text-white"
          style={{ backgroundColor: TYPE_COLORS.grammar }}
        >
          Do {extraBatchSize} more lessons
        </button>
        <div className="mt-4">
          <Link href="/grammar" className="text-sky-600 hover:underline">
            Back to grammar
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "learn") {
    const point = points[slide];
    const isLast = slide === points.length - 1;

    const goPrev = () => setSlide((s) => Math.max(0, s - 1));
    const goNext = () => {
      if (!isLast) setSlide((s) => s + 1);
      else startQuiz();
    };

    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            {mistakesMode ? "Redo" : "Lesson"} {slide + 1} / {points.length}
          </span>
          {mistakesMode && <span>🐢 recent mistakes · no SRS impact</span>}
        </div>

        <div className="overflow-hidden rounded-xl bg-white shadow">
          <div
            className="subject-tile flex min-h-40 flex-col items-center justify-center gap-2 p-8"
            style={{ backgroundColor: TYPE_COLORS.grammar }}
          >
            <p className="text-4xl font-medium" lang="ja">
              {point.title}
            </p>
            <div className="text-lg text-white opacity-90">{point.meaning}</div>
          </div>

          <div className="space-y-4 p-6">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
                N{point.jlptLevel}
              </span>
              {point.partOfSpeech && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                  {point.partOfSpeech}
                </span>
              )}
              {point.register && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                  {point.register}
                </span>
              )}
            </div>

            {point.caution && (
              <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <span aria-hidden="true">⚠️</span>
                <p>{point.caution}</p>
              </div>
            )}

            <div>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Structure
              </h2>
              <p className="text-lg" lang="ja">
                {point.structure}
              </p>
            </div>
            <div>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Explanation
              </h2>
              <p className="whitespace-pre-line leading-relaxed text-slate-700">
                {point.explanation}
              </p>
              {point.wordType && (
                <p className="mt-1 text-sm text-slate-500">Word Type: {point.wordType}</p>
              )}
            </div>

            {(point.aboutIntro || point.aboutCautions.length > 0) && (
              <div>
                <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  About
                </h2>
                {point.aboutIntro && (
                  <p className="whitespace-pre-line leading-relaxed text-slate-700">
                    {point.aboutIntro}
                  </p>
                )}
                <AboutExamples examples={point.aboutIntroExamples} />
                {point.aboutCautions.map((c, i) => (
                  <div key={i} className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
                    <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-900">
                      <span aria-hidden="true">⚠️</span> Caution
                    </h3>
                    <p className="text-sm text-amber-900">{c.text}</p>
                    <AboutExamples examples={c.examples} />
                  </div>
                ))}
              </div>
            )}

            {point.relations && point.relations.length > 0 && (
              <GrammarRelations relations={point.relations} />
            )}

            {point.sentences.length > 0 && (
              <div>
                <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Example sentences
                </h2>
                <div className="space-y-2">
                  {point.sentences.map((s) => (
                    <SentenceCard key={s.id} japanese={s.japanese} english={s.english} audioUrl={s.audioUrl} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-between">
          <button
            onClick={goPrev}
            disabled={slide === 0}
            className="rounded-lg bg-slate-200 px-5 py-2 disabled:opacity-40"
          >
            ← Back
          </button>
          <button
            onClick={goNext}
            className="rounded-lg px-5 py-2 text-white hover:opacity-90"
            style={{ backgroundColor: isLast ? TYPE_COLORS.grammar : "#0284c7" }}
          >
            {isLast ? "Start quiz" : "Next →"}
          </button>
        </div>
      </div>
    );
  }

  // phase === "quiz"
  const task = quiz[0];
  if (!task) return <p className="text-slate-500">Saving…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-4 text-sm text-slate-500">
        Quiz: answer every point correctly to finish the batch ({quiz.length} prompts left)
      </p>
      <GrammarQuizCard
        sentence={task.sentence}
        input={input}
        onInputChange={(value) => {
          setInput(value);
          if (feedback === "retry") setFeedback("idle");
        }}
        onSubmit={handleQuizSubmit}
        feedback={feedback}
        inputRef={inputRef}
      />
    </div>
  );
}
