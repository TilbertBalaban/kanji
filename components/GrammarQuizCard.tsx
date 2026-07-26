"use client";

// The grammar cloze quiz card, shared by grammar reviews and the grammar
// lesson quiz — the counterpart to components/QuizCard.tsx for WaniKani
// subjects. Deliberately diverges from QuizCard's post-answer behavior:
// Bunpro-style reveal+retype means a miss reveals the correct answer inline
// and clears the input, but keeps it EDITABLE — the user must retype the
// correct form to advance, rather than QuizCard's read-only pause-then-Next.

import { type RefObject } from "react";
import * as wanakana from "wanakana";
import { EmphasisText } from "@/components/GrammarPointInfo";
import { GRAMMAR_BLANK, type GrammarSentenceDTO } from "@/lib/grammar";
import { fromCyrillicLayout } from "@/lib/keyboard-layout";
import { TYPE_COLORS } from "@/lib/ui";

// "revealed" = a miss occurred; the correct answer is shown inline and the
// (cleared) input stays editable until the user retypes it correctly.
export type GrammarFeedback = "idle" | "correct" | "revealed" | "retry";

export function GrammarQuizCard({
  sentence,
  input,
  onInputChange,
  onSubmit,
  feedback,
  notice,
  inputRef,
}: {
  sentence: GrammarSentenceDTO;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  feedback: GrammarFeedback;
  // Hint shown on a shake — e.g. the wrong-answer hint for a meaning-
  // equivalent form ("Could you try a grammar point that is more casual
  // here?"). The answer wasn't counted wrong; nudge, don't scold. Also
  // rendered in the revealed state, where a hint form would otherwise
  // shake silently.
  notice?: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const answer = sentence.acceptedAnswers[0] ?? "";
  const [before, after] = sentence.japanese.split(GRAMMAR_BLANK);
  const hasBlank = after !== undefined;

  const feedbackClasses =
    feedback === "correct"
      ? "bg-green-100 border-green-400"
      : feedback === "revealed"
        ? "bg-red-100 border-red-400"
        : feedback === "retry"
          ? "bg-amber-50 border-amber-400 animate-pulse"
          : "bg-white border-slate-300";

  return (
    <div className="overflow-hidden rounded-xl shadow">
      <div
        className="subject-tile flex min-h-40 items-center justify-center p-8"
        style={{ backgroundColor: TYPE_COLORS.grammar }}
      >
        <p className="text-center text-2xl leading-relaxed sm:text-3xl" lang="ja">
          {hasBlank ? (
            <>
              {before}
              {feedback === "revealed" ? (
                <span className="rounded bg-black/20 px-2 font-bold underline decoration-2">
                  {answer}
                </span>
              ) : (
                <span className="rounded border-b-2 border-dashed border-white/70 px-4">
                  {"　".repeat(Math.max(3, answer.length))}
                </span>
              )}
              {after}
            </>
          ) : (
            sentence.japanese
          )}
        </p>
      </div>
      <div className="bg-gradient-to-b from-slate-100 to-slate-300 px-4 py-2 text-center text-sm text-slate-700">
        <EmphasisText text={sentence.english} />
      </div>
      <div className={`relative border-t-4 transition-colors ${feedbackClasses}`}>
        <input
          ref={inputRef}
          value={feedback === "correct" ? answer : input}
          onChange={(e) =>
            onInputChange(
              wanakana.toKana(fromCyrillicLayout(e.target.value), { IMEMode: true }),
            )
          }
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder="答え (kana)"
          className="w-full bg-transparent p-4 text-center text-xl outline-none"
          lang="ja"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          readOnly={feedback === "correct"}
        />
        {feedback === "correct" && (
          <button
            type="button"
            onClick={onSubmit}
            aria-label="Next question"
            title="Next question"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-xl leading-none text-green-600 transition-colors hover:bg-green-200"
          >
            ❯
          </button>
        )}
      </div>
      {feedback === "revealed" && (
        <p className="bg-red-50 px-4 py-2 text-center text-sm text-red-700">
          Not quite — the correct form is shown above. Type it to continue.
        </p>
      )}
      {(feedback === "retry" || feedback === "revealed") && notice && (
        <p className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-800">{notice}</p>
      )}
    </div>
  );
}
