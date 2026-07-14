"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ItemInfoPanel } from "@/components/ItemInfoPanel";
import { MnemonicText } from "@/components/MnemonicText";
import { QuizCard, type QuizFeedback, type TaskKind } from "@/components/QuizCard";
import { ReadingAudio } from "@/components/ReadingAudio";
import { SubjectChar } from "@/components/SubjectChar";
import { SynonymManager } from "@/components/SynonymManager";
import { evaluateAnswer } from "@/lib/answer-checker";
import { isVocabulary, tasksForSubject } from "@/lib/srs";
import type { RelatedSubjectDTO, SubjectDTO } from "@/lib/serialize";
import { subjectPath } from "@/lib/subject-url";
import { TYPE_COLORS, TYPE_LABELS } from "@/lib/ui";
import { useMistakesMode } from "@/lib/use-mistakes-mode";

type Phase = "loading" | "learn" | "quiz" | "empty" | "limit" | "done";

interface LessonSubject extends SubjectDTO {
  components: RelatedSubjectDTO[];
  amalgamations: RelatedSubjectDTO[];
}

interface QuizTask {
  subject: LessonSubject;
  kind: TaskKind;
}

function buildQuizTasks(subjects: LessonSubject[]): QuizTask[] {
  const tasks: QuizTask[] = [];
  for (const subject of subjects) {
    const wanted = tasksForSubject(subject);
    tasks.push({ subject, kind: "meaning" });
    if (wanted.reading) tasks.push({ subject, kind: "reading" });
    // Reverse recall (English → reading) for vocabulary that has a reading.
    if (wanted.recall) tasks.push({ subject, kind: "recall" });
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
  const isVocab = isVocabulary(subject.type);
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

function RelatedGrid({ items }: { items: RelatedSubjectDTO[] }) {
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

// useMistakesMode reads the URL via useSearchParams, which requires a
// Suspense boundary on a prerendered page (build error without one).
export default function LessonsPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Loading…</p>}>
      <LessonsSession />
    </Suspense>
  );
}

function LessonsSession() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [subjects, setSubjects] = useState<LessonSubject[]>([]);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [slide, setSlide] = useState(0);
  const [tab, setTab] = useState(0);
  const [quiz, setQuiz] = useState<QuizTask[]>([]);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<QuizFeedback>("idle");
  // WaniKani-style answer-checker messages (see app/reviews/page.tsx).
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  // Collapsed by default in the lesson quiz — the item was just studied.
  const [showItemInfo, setShowItemInfo] = useState(false);
  const inputCharsRef = useRef("");
  const [doneToday, setDoneToday] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(10);
  const [extraBatchSize, setExtraBatchSize] = useState(5);
  const inputRef = useRef<HTMLInputElement>(null);

  // "Redo Lessons" over recent mistakes: re-teach the lesson info + quiz for the
  // items missed in the past 24h, with no daily-limit gating and no SRS change.
  const mistakesMode = useMistakesMode();

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
      setInfoMessage(null);
      setShowItemInfo(false);
      if (rest.length === 0) void finishBatch();
      return;
    }
    if (feedback === "incorrect") {
      // requeue the missed task at the back
      setQuiz([...quiz.slice(1), task]);
      setInput("");
      setFeedback("idle");
      setInfoMessage(null);
      setShowItemInfo(false);
      return;
    }

    // Both "reading" and "recall" are answered with the reading in kana.
    const verdict = evaluateAnswer({
      questionType: task.kind === "meaning" ? "meaning" : "reading",
      recall: task.kind === "recall",
      response: input,
      inputChars: inputCharsRef.current,
      subject: task.subject,
      userSynonyms: task.subject.userSynonyms,
    });

    if (verdict.action === "retry") {
      // Shake and keep the hint up until the answer is edited, like WaniKani.
      setRetryMessage(verdict.message);
      setFeedback("retry");
    } else {
      setInfoMessage(verdict.message);
      setFeedback(verdict.action === "pass" ? "correct" : "incorrect");
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
    const isVocab = isVocabulary(subject.type);
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
                    <ReadingAudio
                      audioUrls={subject.audioUrls}
                      readings={acceptedReadings.map((r) => r.reading)}
                    />
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
  // Reading and recall are both answered with the reading in kana.
  const wantsKana = task.kind === "reading" || task.kind === "recall";

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-4 text-sm text-slate-500">
        Quiz: answer every item correctly to finish the batch ({quiz.length} prompts left)
      </p>
      <QuizCard
        subject={task.subject}
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
        onSubmit={handleQuizSubmit}
        feedback={feedback}
        inputRef={inputRef}
        size="compact"
      />
      {feedback === "retry" && retryMessage && (
        <p className="mx-auto mt-3 max-w-md rounded-lg bg-slate-500 px-4 py-2 text-center text-sm text-white shadow">
          {retryMessage}
        </p>
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
        <div className="mt-3 text-center text-sm">
          <p className="text-green-600">Correct! Press Enter.</p>
          {infoMessage && <p className="mt-1 text-slate-500">{infoMessage}</p>}
        </div>
      )}
      {(feedback === "correct" || feedback === "incorrect") && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              setShowItemInfo((s) => !s);
              // Keep Enter-to-continue working after the click moves focus.
              inputRef.current?.focus();
            }}
            className="mx-auto block text-sm text-sky-600 hover:underline"
          >
            {showItemInfo ? "Hide item info" : "Show item info"}
          </button>
          {showItemInfo && (
            <div className="mt-2">
              <ItemInfoPanel subject={task.subject} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
