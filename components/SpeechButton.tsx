"use client";

// Text-to-speech for custom vocabulary, which has no WaniKani audio clips.
// Uses the browser's SpeechSynthesis API with a Japanese voice, styled like
// AudioButton so both kinds of pronunciation buttons look the same. With
// `autoPlay` it speaks once on mount — the review page remounts it whenever a
// reading is revealed, mirroring how AudioButton sounds out WaniKani vocab.

import { useEffect } from "react";

/** The best available Japanese voice, or null (engine default for ja-JP). */
function japaneseVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("ja"));
  return voices.find((v) => v.localService) ?? voices[0] ?? null;
}

export function speakJapanese(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  const voice = japaneseVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

export function SpeechButton({
  text,
  autoPlay = false,
  className = "",
}: {
  text: string;
  autoPlay?: boolean;
  className?: string;
}) {
  useEffect(() => {
    if (autoPlay) speakJapanese(text);
    return () => window.speechSynthesis?.cancel();
    // Speak once on mount; the button is remounted per reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // speechSynthesis is available in every modern browser; speakJapanese
  // no-ops on the rare exception, so the button renders unconditionally.
  return (
    <button
      type="button"
      onClick={() => speakJapanese(text)}
      aria-label="Play pronunciation"
      className={`flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-white transition-colors hover:bg-slate-700 ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
        <path d="M4 9v6h4l5 5V4L8 9H4z" />
        <path d="M16 8.5a4 4 0 0 1 0 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}
