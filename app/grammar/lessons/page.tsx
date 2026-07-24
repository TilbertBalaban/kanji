"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { GrammarQuizCard, type GrammarFeedback } from "@/components/GrammarQuizCard";
import { LegendInfoButton } from "@/components/GrammarLegendModal";
import {
  AboutExamples,
  AboutIntroBlocks,
  GrammarRelations,
  GrammarResources,
  SentenceCard,
  StructureSection,
  ViewOnBunproButton,
} from "@/components/GrammarPointInfo";
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

function buildQuizTask(point: LessonPoint): QuizTask | null {
  if (point.sentences.length === 0) return null;
  return { point, sentence: point.sentences[0], missed: false };
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
  const [index, setIndex] = useState(0);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [quizTask, setQuizTask] = useState<QuizTask | null>(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<GrammarFeedback>("idle");
  const [notice, setNotice] = useState<string | null>(null);
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
          setIndex(0);
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
          setIndex(0);
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
  }, [phase, quizTask, feedback]);

  // Complete just the current point, then move on — each grammar point is
  // taught and quizzed on its own rather than batched with others. The POST
  // only blocks the UI before the end-of-batch refetch (which must see it);
  // between points the next lesson shows immediately. A failed completion is
  // swallowed rather than stranding the page on "Saving…" — the point just
  // stays uncompleted and comes back in a later batch.
  const advance = useCallback(async () => {
    const current = points[index];
    const completion =
      !mistakesMode && current
        ? fetch("/api/grammar/lessons/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ grammarPointIds: [current.id] }),
          }).catch(() => {})
        : null;
    const next = index + 1;
    if (next < points.length) {
      setIndex(next);
      setInput("");
      setFeedback("idle");
      setPhase("learn");
    } else if (mistakesMode) {
      setPhase("done");
    } else {
      await completion;
      load();
    }
  }, [points, index, mistakesMode, load]);

  const startQuiz = () => {
    const task = buildQuizTask(points[index]);
    if (!task) {
      void advance();
      return;
    }
    setQuizTask(task);
    setPhase("quiz");
  };

  const handleQuizSubmit = useCallback(() => {
    const task = quizTask;
    if (!task) return;

    if (feedback === "correct") {
      setQuizTask(null);
      setInput("");
      setFeedback("idle");
      setNotice(null);
      void advance();
      return;
    }

    const verdict = checkGrammarAnswer(
      input,
      task.sentence.acceptedAnswers,
      task.sentence.wrongAnswerHints,
    );

    if (verdict.action === "retry") {
      // An empty Enter after a miss must not hide the revealed answer — the
      // user still has to retype it (see the reviews page). A meaning-
      // equivalent wrong form also retries (with its hint) instead of
      // failing. In the revealed state the empty-input nudge is dropped (the
      // red banner already says to retype) but a real hint still shows.
      setNotice(task.missed && !input.trim() ? null : verdict.message);
      setFeedback(task.missed ? "revealed" : "retry");
      return;
    }
    if (verdict.action === "pass") {
      setFeedback("correct");
    } else {
      // Reveal+retype — the teaching moment. Stay on this task; the miss is
      // remembered on the task itself (though lesson quizzes never affect SRS).
      setQuizTask({ ...task, missed: true });
      setInput("");
      setFeedback("revealed");
    }
  }, [quizTask, input, feedback, advance]);

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
    const point = points[index];

    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between text-sm text-slate-500">
          <span>{mistakesMode ? "Redo" : "Lesson"}</span>
          {mistakesMode && <span>🐢 recent mistakes · no SRS impact</span>}
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <div
            className="subject-tile flex min-h-40 flex-col items-center justify-center gap-2 p-8"
            style={{ backgroundColor: TYPE_COLORS.grammar }}
          >
            <p className="text-4xl font-medium" lang="ja">
              {point.title}
            </p>
            <div className="text-lg text-white opacity-90">{point.meaning}</div>
          </div>

          <div className="p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
                N{point.jlptLevel}
              </span>
              {point.partOfSpeech && (
                <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                  {point.partOfSpeech}
                  <LegendInfoButton
                    legend="part-of-speech"
                    target={point.partOfSpeech}
                    label="Parts of Speech Legend"
                    size="sm"
                  />
                </span>
              )}
            </div>

            {point.caution && (
              <div className="mb-4 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <span aria-hidden="true">⚠️</span>
                <p>{point.caution}</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4">
          <ViewOnBunproButton slug={point.slug} />
        </div>

        {/* Structure / Details — side-by-side tiles */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <StructureSection
              standard={point.structureStandard}
              polite={point.structurePolite}
              variant="lesson"
            />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-3 text-lg text-slate-800">Details</h2>
            <dl className="space-y-3 text-sm">
              {point.register && (
                <div>
                  <dt className="mb-1 flex items-center gap-1.5 text-slate-400">
                    Register
                    <LegendInfoButton
                      legend="register"
                      target={point.register}
                      label="Register"
                      size="sm"
                    />
                  </dt>
                  <dd className="text-base text-slate-800">{point.register}</dd>
                </div>
              )}
              {point.wordType && (
                <div>
                  <dt className="mb-1 flex items-center gap-1.5 text-slate-400">
                    Word Type
                    <LegendInfoButton
                      legend="word-type"
                      target={point.wordType}
                      label="Word Type Legend"
                      size="sm"
                    />
                  </dt>
                  <dd className="text-base text-slate-800">{point.wordType}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* About */}
        {(point.explanation || point.aboutIntroBlocks.length > 0 || point.aboutCautions.length > 0) && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-3 text-lg text-slate-800">About {point.title}</h2>
            {point.explanation && (
              <p className="whitespace-pre-line leading-relaxed text-slate-700">
                {point.explanation}
              </p>
            )}
            <AboutIntroBlocks blocks={point.aboutIntroBlocks} />
            {point.aboutCautions.map((c, i) => (
              <div key={i} className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
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
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
            <GrammarRelations relations={point.relations} />
          </div>
        )}

        {point.sentences.length > 0 && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-3 text-lg text-slate-800">Example sentences</h2>
            <div className="space-y-3">
              {point.sentences.map((s) => (
                <SentenceCard
                  key={s.id}
                  japanese={s.japanese}
                  english={s.english}
                  audioUrl={s.audioUrl}
                  answer={s.acceptedAnswers[0] ?? null}
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
          <GrammarResources
            online={point.onlineResources}
            offline={point.offlineResources}
            slug={point.slug}
          />
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={startQuiz}
            className="rounded-lg px-5 py-2 text-white hover:opacity-90"
            style={{ backgroundColor: TYPE_COLORS.grammar }}
          >
            Start quiz
          </button>
        </div>
      </div>
    );
  }

  // phase === "quiz"
  const task = quizTask;
  if (!task) return <p className="text-slate-500">Saving…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-4 text-sm text-slate-500">Quiz: answer correctly to continue</p>
      <GrammarQuizCard
        sentence={task.sentence}
        input={input}
        onInputChange={(value) => {
          setInput(value);
          setNotice(null);
          if (feedback === "retry") setFeedback("idle");
        }}
        onSubmit={handleQuizSubmit}
        feedback={feedback}
        notice={notice}
        inputRef={inputRef}
      />
    </div>
  );
}
