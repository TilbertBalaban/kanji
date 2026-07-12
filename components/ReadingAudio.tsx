"use client";

// WaniKani-style pronunciation audio: each reading is a heading, and under it
// one speaker button per voice actor (e.g. Kyoko, Kenichi). Clicking plays the
// clip. Vocab often ships several clips per reading (one per voice actor, in
// multiple content types) — we group by reading, then by voice actor, and pick
// a browser-friendly file to play (mpeg over webm).

import { useRef } from "react";
import type { PronunciationAudio } from "@/lib/audio";

interface Speaker {
  voiceActorName: string;
  accent: string;
  gender: string;
  url: string;
}

interface ReadingGroup {
  reading: string;
  speakers: Speaker[];
}

function groupByReading(audioUrls: PronunciationAudio[]): ReadingGroup[] {
  const groups: ReadingGroup[] = [];
  for (const a of audioUrls) {
    let group = groups.find((g) => g.reading === a.pronunciation);
    if (!group) {
      group = { reading: a.pronunciation, speakers: [] };
      groups.push(group);
    }
    const existing = group.speakers.find((s) => s.voiceActorName === a.voiceActorName);
    if (existing) {
      // Prefer mpeg — it plays everywhere, unlike webm in Safari.
      if (a.contentType === "audio/mpeg") existing.url = a.url;
    } else {
      group.speakers.push({
        voiceActorName: a.voiceActorName,
        accent: a.accent,
        gender: a.gender,
        url: a.url,
      });
    }
  }
  return groups;
}

function SpeakerButton({ speaker }: { speaker: Speaker }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const play = () => {
    if (!audioRef.current) audioRef.current = new Audio(speaker.url);
    audioRef.current.currentTime = 0;
    void audioRef.current.play();
  };
  return (
    <button
      onClick={play}
      className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 flex-none fill-current" aria-hidden="true">
        <path d="M4 9v6h4l5 5V4L8 9H4z" />
        <path d="M16 8.5a4 4 0 0 1 0 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span>
        <span className="font-semibold uppercase">{speaker.voiceActorName}</span>
        {(speaker.accent || speaker.gender) && (
          <span className="text-slate-400">
            {" "}
            ({[speaker.accent, speaker.gender].filter(Boolean).join(", ")})
          </span>
        )}
      </span>
    </button>
  );
}

export function ReadingAudio({
  audioUrls,
  readings = [],
}: {
  audioUrls: PronunciationAudio[];
  /** Accepted readings to list even when they have no audio clip (e.g. the ビーだま kana variant of びーだま). */
  readings?: string[];
}) {
  const audioGroups = groupByReading(audioUrls);
  const groups = [
    ...readings.map(
      (reading) => audioGroups.find((g) => g.reading === reading) ?? { reading, speakers: [] },
    ),
    ...audioGroups.filter((g) => !readings.includes(g.reading)),
  ];
  if (groups.length === 0) return null;
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.reading}>
          {group.reading && (
            <p className="text-xl" lang="ja">
              {group.reading}
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {group.speakers.map((s) => (
              <SpeakerButton key={s.voiceActorName} speaker={s} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
