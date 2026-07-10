"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import * as wanakana from "wanakana";
import { AudioButton } from "@/components/AudioButton";
import { MnemonicText } from "@/components/MnemonicText";
import { ReadingAudio } from "@/components/ReadingAudio";
import { SubjectChar } from "@/components/SubjectChar";
import { SynonymManager } from "@/components/SynonymManager";
import { checkMeaning, checkReading } from "@/lib/srs";
import type { SubjectDTO } from "@/lib/serialize";
import { subjectPath } from "@/lib/subject-url";
import { TYPE_COLORS, TYPE_LABELS } from "@/lib/ui";

type Phase = "loading" | "learn" | "quiz" | "empty" | "limit" | "done";
// "recall" is the KaniWani-style reverse task: shown the English meaning, type the reading.
type TaskKind = "meaning" | "reading" | "recall";

const VOCAB_TYPES = new Set(["vocabulary", "kana_vocabulary"]);

interface RelatedSubject {
  id: number;
  type: string;
  characters: string | null;
  characterImage: string | null;
  slug: string;
  primaryMeaning: string;
  primaryReading: string | null;
}

interface LessonSubject extends SubjectDTO {
  components: RelatedSubject[];
  amalgamations: RelatedSubject[];
}

interface QuizTask {
  subject: LessonSubject;
  kind: TaskKind;
}

function buildQuizTasks(subjects: LessonSubject[]): QuizTask[] {
  const tasks: QuizTask[] = [];
  for (const subject of subjects) {
    tasks.push({ subject, kind: "meaning" });
    if (subject.type !== "radical" && subject.readings.some((r) => r.acceptedAnswer)) {
      tasks.push({ subject, kind: "reading" });
    }
    // Reverse recall (English → reading) for vocabulary that has a reading.
    if (VOCAB_TYPES.has(subject.type) && subject.readings.some((r) => r.acceptedAnswer)) {
      tasks.push({ subject, kind: "recall" });
    }
  }
  // shuffle
  for (let i = tasks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
  }
  return tasks;
}

type TabKey = "composition" | "meaning" | "reading" | "context";

interface TabDef {
  key: TabKey;
  label: string;
}

// WaniKani shows a different set of info tabs per subject type. Composition and
// examples/context tabs are omitted when the subject has no data for them.
function buildTabs(subject: LessonSubject): TabDef[] {
  const tabs: TabDef[] = [];
  const isVocab = subject.type === "vocabulary" || subject.type === "kana_vocabulary";
  const hasReadings = subject.readings.some((r) => r.acceptedAnswer);

  if (subject.type === "kanji" && subject.components.length > 0) {
    tabs.push({ key: "composition", label: "Radicals" });
  } else if (isVocab && subject.components.length > 0) {
    tabs.push({ key: "composition", label: "Kanji Composition" });
  }

  tabs.push({ key: "meaning", label: "Meaning" });

  if (hasReadings) {
    tabs.push({ key: "reading", label: subject.type === "kanji" ? "Readings" : "Reading" });
  }

  if (isVocab && subject.contextSentences.length > 0) {
    tabs.push({ key: "context", label: "Context" });
  } else if (subject.amalgamations.length > 0) {
    tabs.push({ key: "context", label: "Examples" });
  }

  return tabs;
}

function RelatedGrid({ items }: { items: RelatedSubject[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {items.map((r) => (
        <Link
          key={r.id}
          href={subjectPath(r)}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-white shadow-sm hover:opacity-90"
          style={{ backgroundColor: TYPE_COLORS[r.type] }}
        >
          <SubjectChar
            characters={r.characters}
            characterImage={r.characterImage}
            className="text-2xl font-medium"
          />
          <span className="text-sm">{r.primaryMeaning}</span>
        </Link>
      ))}
    </div>
  );
}

export default function LessonsPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [subjects, setSubjects] = useState<LessonSubject[]>([]);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [slide, setSlide] = useState(0);
  const [tab, setTab] = useState(0);
  const [quiz, setQuiz] = useState<QuizTask[]>([]);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<"idle" | "correct" | "incorrect" | "retry">("idle");
  const [doneToday, setDoneToday] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(10);
  const [extraBatchSize, setExtraBatchSize] = useState(5);
  const inputRef = useRef<HTMLInputElement>(null);

  // "Redo Lessons" over recent mistakes: re-teach the lesson info + quiz for the
  // items missed in the past 24h, with no daily-limit gating and no SRS change.
  const [mistakesMode] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("source") === "mistakes",
  );

  const load = useCallback((extra = false) => {
    setPhase("loading");
    if (mistakesMode) {
      fetch("/api/recent-mistakes")
        .then((r) => r.json())
        .then((data: { subjects: LessonSubject[] }) => {
          setTotalAvailable(data.subjects.length);
          setSubjects(data.subjects);
          setSlide(0);
          setTab(0);
          setInput("");
          setFeedback("idle");
          setPhase(data.subjects.length > 0 ? "learn" : "empty");
        });
      return;
    }
    fetch(extra ? "/api/lessons?extra=1" : "/api/lessons?limit=5")
      .then((r) => r.json())
      .then(
        (data: {
          total: number;
          doneToday: number;
          dailyLimit: number;
          extraBatchSize: number;
          subjects: LessonSubject[];
        }) => {
          setTotalAvailable(data.total);
          setDoneToday(data.doneToday);
          setDailyLimit(data.dailyLimit);
          setExtraBatchSize(data.extraBatchSize);
          setSubjects(data.subjects);
          setSlide(0);
          setTab(0);
          setInput("");
          setFeedback("idle");
          if (data.subjects.length > 0) setPhase("learn");
          else if (data.total > 0) setPhase("limit");
          else setPhase("empty");
        },
      );
  }, [mistakesMode]);

  useEffect(load, [load]);

  useEffect(() => {
    if (phase === "quiz") inputRef.current?.focus();
  }, [phase, quiz, feedback]);

  const startQuiz = () => {
    setQuiz(buildQuizTasks(subjects));
    setPhase("quiz");
  };

  const finishBatch = useCallback(async () => {
    // Redo is practice only — don't start/advance any SRS assignment.
    if (mistakesMode) {
      setPhase("done");
      return;
    }
    await fetch("/api/lessons/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectIds: subjects.map((s) => s.id) }),
    });
    load();
  }, [subjects, load, mistakesMode]);

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

    // Both "reading" and "recall" are answered with the reading in kana.
    const result =
      task.kind === "meaning"
        ? checkMeaning(
            input,
            task.subject.meanings,
            task.subject.auxMeanings,
            task.subject.userSynonyms,
          )
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
        <p className="text-2xl">
          {mistakesMode ? "🎉 No recent mistakes to redo." : "No lessons available right now."}
        </p>
        <p className="mt-2 text-slate-500">
          {mistakesMode
            ? "Nothing missed in the past 24 hours."
            : "Do your reviews to unlock more items."}
        </p>
        <Link href="/" className="mt-4 inline-block text-sky-600 hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow">
        <p className="text-2xl">Nice — you redid your recent mistakes! 🎉</p>
        <p className="mt-2 text-slate-500">
          Extra practice only — your SRS wasn&apos;t affected.
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
    const tabs = buildTabs(subject);
    const activeTab = tabs[Math.min(tab, tabs.length - 1)];
    const isVocab = subject.type === "vocabulary" || subject.type === "kana_vocabulary";
    const isLast = slide === subjects.length - 1;
    const onLastTab = tab >= tabs.length - 1;

    const goPrev = () => {
      if (tab > 0) setTab((t) => t - 1);
      else if (slide > 0) {
        const prev = buildTabs(subjects[slide - 1]);
        setSlide((s) => s - 1);
        setTab(prev.length - 1);
      }
    };
    const goNext = () => {
      if (!onLastTab) setTab((t) => t + 1);
      else if (!isLast) {
        setSlide((s) => s + 1);
        setTab(0);
      } else {
        startQuiz();
      }
    };

    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            {mistakesMode ? "Redo" : "Lesson"} {slide + 1} / {subjects.length}
          </span>
          <span>
            {mistakesMode
              ? "🐢 recent mistakes · no SRS impact"
              : `${totalAvailable} lessons in queue`}
          </span>
        </div>

        <div className="overflow-hidden rounded-xl bg-white shadow">
          <div
            className="subject-tile flex min-h-40 flex-col items-center justify-center gap-2 p-8"
            style={{ backgroundColor: color }}
          >
            <SubjectChar
              characters={subject.characters}
              characterImage={subject.characterImage}
              className="text-7xl font-medium"
            />
            <div className="text-lg text-white opacity-90">
              {subject.meanings.find((m) => m.primary)?.meaning}
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex justify-center gap-6 bg-slate-800 px-4 text-sm font-medium">
            {tabs.map((t, i) => (
              <button
                key={t.key}
                onClick={() => setTab(i)}
                className={`relative py-3 transition-colors ${
                  i === tab
                    ? "text-white after:absolute after:-bottom-px after:left-1/2 after:h-2 after:w-2 after:-translate-x-1/2 after:rotate-45 after:bg-white after:content-['']"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="min-h-48 p-6">
            {activeTab.key === "composition" && (
              <section>
                <h2 className="mb-3 text-lg font-semibold">
                  {isVocab ? "Kanji Composition" : "Radical Composition"}
                </h2>
                <p className="mb-4 text-slate-600">
                  {isVocab
                    ? `This vocabulary is composed of ${subject.components.length === 1 ? "one kanji" : `${subject.components.length} kanji`}:`
                    : `This kanji is composed of ${subject.components.length === 1 ? "one radical" : `${subject.components.length} radicals`}:`}
                </p>
                <RelatedGrid items={subject.components} />
              </section>
            )}

            {activeTab.key === "meaning" && (
              <section>
                <h2 className="mb-2 text-lg font-semibold">Meaning</h2>
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
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <SynonymManager
                    key={subject.id}
                    subjectId={subject.id}
                    initialSynonyms={subject.userSynonyms}
                    onChange={(synonyms) =>
                      setSubjects((prev) =>
                        prev.map((s) =>
                          s.id === subject.id ? { ...s, userSynonyms: synonyms } : s,
                        ),
                      )
                    }
                  />
                </div>
              </section>
            )}

            {activeTab.key === "reading" && (
              <section>
                <h2 className="mb-2 text-lg font-semibold">
                  {subject.type === "kanji" ? "Readings" : "Reading"}
                </h2>
                {subject.audioUrls.length > 0 ? (
                  <div className="mb-1">
                    <ReadingAudio audioUrls={subject.audioUrls} />
                  </div>
                ) : (
                  <p className="text-xl font-medium" lang="ja">
                    {acceptedReadings
                      .map((r) => `${r.reading}${r.type ? ` (${r.type})` : ""}`)
                      .join("、")}
                  </p>
                )}
                {subject.readingMnemonic && (
                  <div className="mt-3 text-slate-700">
                    <MnemonicText text={subject.readingMnemonic} />
                  </div>
                )}
                {subject.readingHint && (
                  <p className="mt-2 rounded bg-slate-50 p-2 text-sm text-slate-500">
                    Hint: {subject.readingHint}
                  </p>
                )}
              </section>
            )}

            {activeTab.key === "context" && activeTab.label === "Context" && (
              <section>
                <h2 className="mb-3 text-lg font-semibold">Context Sentences</h2>
                {subject.contextSentences.map((s, i) => (
                  <p key={i} className="mb-3 text-sm">
                    <span lang="ja" className="text-base">
                      {s.ja}
                    </span>
                    <br />
                    <span className="text-slate-500">{s.en}</span>
                  </p>
                ))}
              </section>
            )}

            {activeTab.key === "context" && activeTab.label === "Examples" && (
              <section>
                <h2 className="mb-3 text-lg font-semibold">Examples</h2>
                <p className="mb-4 text-slate-600">
                  {subject.type === "radical"
                    ? "Kanji that use this radical:"
                    : "Vocabulary that use this kanji:"}
                </p>
                <RelatedGrid items={subject.amalgamations} />
              </section>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-between">
          <button
            onClick={goPrev}
            disabled={slide === 0 && tab === 0}
            className="rounded-lg bg-slate-200 px-5 py-2 disabled:opacity-40"
          >
            ← Back
          </button>
          <button
            onClick={goNext}
            className={`rounded-lg px-5 py-2 text-white ${
              onLastTab && isLast
                ? "bg-pink-600 hover:bg-pink-700"
                : "bg-sky-600 hover:bg-sky-700"
            }`}
          >
            {onLastTab && isLast ? "Start quiz" : "Next →"}
          </button>
        </div>
      </div>
    );
  }

  // phase === "quiz"
  const task = quiz[0];
  if (!task) return <p className="text-slate-500">Saving…</p>;
  const isRecall = task.kind === "recall";
  // Reading and recall are both answered with the reading in kana.
  const wantsKana = task.kind === "reading" || task.kind === "recall";
  const color = TYPE_COLORS[task.subject.type];
  const acceptedMeanings = task.subject.meanings.filter((m) => m.acceptedAnswer);
  const promptMeaning =
    acceptedMeanings.find((m) => m.primary)?.meaning ?? acceptedMeanings[0]?.meaning ?? "";
  const extraMeanings = acceptedMeanings
    .filter((m) => m.meaning !== promptMeaning)
    .map((m) => m.meaning);

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-4 text-sm text-slate-500">
        Quiz: answer every item correctly to finish the batch ({quiz.length} prompts left)
      </p>
      <div className="overflow-hidden rounded-xl shadow">
        <div
          className="subject-tile flex min-h-40 items-center justify-center p-8"
          style={{ backgroundColor: color }}
        >
          {isRecall ? (
            <div className="text-center">
              <p className="text-4xl font-medium leading-snug">{promptMeaning}</p>
              {extraMeanings.length > 0 && (
                <p className="mt-2 text-lg opacity-80">{extraMeanings.join(", ")}</p>
              )}
            </div>
          ) : (
            <SubjectChar
              characters={task.subject.characters}
              characterImage={task.subject.characterImage}
              className="text-6xl font-medium"
            />
          )}
        </div>
        <div
          className={`py-2 text-center text-sm ${
            task.kind === "meaning"
              ? "bg-gradient-to-b from-slate-100 to-slate-300 text-slate-700"
              : "bg-gradient-to-b from-slate-700 to-slate-900 text-white"
          }`}
        >
          {TYPE_LABELS[task.subject.type]}{" "}
          <span className="font-bold">{task.kind === "meaning" ? "Meaning" : "Reading"}</span>
          {isRecall && (
            <span className={task.kind === "meaning" ? "text-slate-500" : "text-slate-400"}>
              {" "}· from English
            </span>
          )}
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
              setInput(wantsKana ? wanakana.toKana(raw, { IMEMode: true }) : raw);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleQuizSubmit()}
            placeholder={wantsKana ? "答え (kana)" : "Your answer (English)"}
            className="w-full bg-transparent p-4 text-center text-xl outline-none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      </div>
      {(feedback === "correct" || feedback === "incorrect") &&
        VOCAB_TYPES.has(task.subject.type) &&
        task.subject.audioUrls.length > 0 && (
          <div className="mt-4 flex justify-center">
            <AudioButton
              key={`${task.subject.id}-${task.kind}-${feedback}`}
              audioUrls={task.subject.audioUrls}
              autoPlay={wantsKana}
            />
          </div>
        )}
      {feedback === "incorrect" && (
        <p className="mt-3 text-center text-sm text-red-600">
          Not quite —{" "}
          {wantsKana
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
