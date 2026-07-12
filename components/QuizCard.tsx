"use client";

import { useEffect, useRef, type RefObject } from "react";
import * as wanakana from "wanakana";
import { AudioButton } from "@/components/AudioButton";
import { SubjectChar } from "@/components/SubjectChar";
import type { SubjectDTO } from "@/lib/serialize";
import { isVocabulary } from "@/lib/srs";
import { TYPE_COLORS, TYPE_LABELS } from "@/lib/ui";

// "recall" is the KaniWani-style reverse task: shown the English meaning, type the reading.
export type TaskKind = "meaning" | "reading" | "recall";
export type QuizFeedback = "idle" | "correct" | "incorrect" | "retry";

export type QuizSubject = Pick<
  SubjectDTO,
  "id" | "type" | "characters" | "characterImage" | "meanings" | "readings" | "audioUrls"
>;

// The quiz prompt card shared by reviews and the lesson quiz: subject tile
// (characters, or the English meaning for recall), task banner, answer input
// with feedback colouring, and the post-answer vocabulary audio button.
export function QuizCard({
  subject,
  kind,
  input,
  onInputChange,
  onSubmit,
  feedback,
  inputRef,
  size = "large",
}: {
  subject: QuizSubject;
  kind: TaskKind;
  input: string;
  // inputChars = raw keystrokes before kana conversion, so the answer checker
  // can spot an English meaning typed into a reading field.
  onInputChange: (value: string, inputChars: string) => void;
  onSubmit: () => void;
  feedback: QuizFeedback;
  inputRef: RefObject<HTMLInputElement | null>;
  size?: "large" | "compact";
}) {
  const isRecall = kind === "recall";
  // Reading and recall are both answered with the reading in kana.
  const wantsKana = kind === "reading" || kind === "recall";
  // Raw keystrokes typed into a kana field, reconstructed from InputEvent.data
  // (the field itself only ever holds the converted kana).
  const inputCharsRef = useRef("");
  useEffect(() => {
    if (input === "") inputCharsRef.current = "";
  }, [input]);
  const color = TYPE_COLORS[subject.type];
  const acceptedMeanings = subject.meanings.filter((m) => m.acceptedAnswer);
  const promptMeaning =
    acceptedMeanings.find((m) => m.primary)?.meaning ?? acceptedMeanings[0]?.meaning ?? "";
  const extraMeanings = acceptedMeanings
    .filter((m) => m.meaning !== promptMeaning)
    .map((m) => m.meaning);

  const feedbackClasses =
    feedback === "correct"
      ? "bg-green-100 border-green-400"
      : feedback === "incorrect"
        ? "bg-red-100 border-red-400"
        : feedback === "retry"
          ? "bg-amber-50 border-amber-400 animate-pulse"
          : "bg-white border-slate-300";

  return (
    <>
      <div className="overflow-hidden rounded-xl shadow">
        <div
          className={`subject-tile flex items-center justify-center p-8 ${
            size === "large" ? "min-h-48" : "min-h-40"
          }`}
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
              characters={subject.characters}
              characterImage={subject.characterImage}
              className={`font-medium ${size === "large" ? "text-7xl" : "text-6xl"}`}
            />
          )}
        </div>
        <div
          className={`py-2 text-center text-sm ${
            kind === "meaning"
              ? "bg-gradient-to-b from-slate-100 to-slate-300 text-slate-700"
              : "bg-gradient-to-b from-slate-700 to-slate-900 text-white"
          }`}
        >
          {TYPE_LABELS[subject.type]}{" "}
          <span className="font-bold">{kind === "meaning" ? "Meaning" : "Reading"}</span>
          {isRecall && <span className="text-slate-400"> · from English</span>}
        </div>
        <div className={`border-t-4 transition-colors ${feedbackClasses}`}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => {
              const raw = e.target.value;
              if (wantsKana) {
                const native = e.nativeEvent as InputEvent;
                if (raw === "") inputCharsRef.current = "";
                else if (native.inputType?.startsWith("delete"))
                  inputCharsRef.current = inputCharsRef.current.slice(0, -1);
                else if (native.data) inputCharsRef.current += native.data;
                else inputCharsRef.current = raw; // paste/autofill fallback
                onInputChange(wanakana.toKana(raw, { IMEMode: true }), inputCharsRef.current);
              } else {
                onInputChange(raw, raw);
              }
            }}
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
            placeholder={wantsKana ? "答え (kana)" : "Your answer (English)"}
            className="w-full bg-transparent p-4 text-center text-xl outline-none"
            lang={wantsKana ? "ja" : "en"}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            readOnly={feedback === "correct" || feedback === "incorrect"}
          />
        </div>
      </div>

      {(feedback === "correct" || feedback === "incorrect") &&
        isVocabulary(subject.type) &&
        subject.audioUrls.length > 0 && (
          <div className="mt-4 flex justify-center">
            <AudioButton
              key={`${subject.id}-${kind}-${feedback}`}
              audioUrls={subject.audioUrls}
              autoPlay={wantsKana}
            />
          </div>
        )}
    </>
  );
}
