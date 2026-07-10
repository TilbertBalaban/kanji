"use client";

// A single round speaker button used in the review/lesson quiz, where there is
// no space for the full per-voice-actor layout. Plays a preferred clip (mpeg,
// random voice actor) and — when `autoPlay` is set — plays once on mount, which
// is how WaniKani sounds the word out the moment a reading is revealed.

import { useEffect, useRef } from "react";
import { pickAudioClip, type PronunciationAudio } from "@/lib/audio";

export function AudioButton({
  audioUrls,
  reading,
  autoPlay = false,
  className = "",
}: {
  audioUrls: PronunciationAudio[];
  reading?: string; // restrict playback to this reading, if given
  autoPlay?: boolean;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = () => {
    const url = pickAudioClip(audioUrls, reading);
    if (!url) return;
    audioRef.current?.pause();
    audioRef.current = new Audio(url);
    void audioRef.current.play();
  };

  useEffect(() => {
    if (autoPlay) play();
    // Play once on mount; the button is remounted each time a reading is revealed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (audioUrls.length === 0) return null;

  return (
    <button
      onClick={play}
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
