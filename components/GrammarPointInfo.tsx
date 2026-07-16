"use client";

// Shared rendering pieces for a grammar point's full write-up — used by both
// the /grammar/[slug] detail page and the /grammar/lessons "learn" step, so
// a lesson shows exactly the same info a user would find on the detail page.

import Link from "next/link";
import { useRef } from "react";
import type { GrammarAboutExampleDTO, GrammarRelationDTO } from "@/lib/grammar";

function SentenceAudioButton({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const play = () => {
    audioRef.current?.pause();
    audioRef.current = new Audio(url);
    audioRef.current.play().catch(() => {});
  };
  return (
    <button
      onClick={play}
      aria-label="Play audio"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white transition-colors hover:bg-slate-700"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
        <path d="M4 9v6h4l5 5V4L8 9H4z" />
        <path
          d="M16 8.5a4 4 0 0 1 0 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

export function SentenceCard({
  japanese,
  english,
  audioUrl,
}: {
  japanese: string;
  english: string;
  audioUrl: string | null;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
      {audioUrl && <SentenceAudioButton url={audioUrl} />}
      <div>
        <p lang="ja" className="text-base">
          {japanese}
        </p>
        <p className="text-sm text-slate-500">{english}</p>
      </div>
    </div>
  );
}

export function AboutExamples({ examples }: { examples: GrammarAboutExampleDTO[] }) {
  if (examples.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {examples.map((ex, i) => (
        <SentenceCard key={i} japanese={ex.japanese} english={ex.english} audioUrl={ex.audioUrl} />
      ))}
    </div>
  );
}

export const GRAMMAR_RELATION_SECTIONS: { type: string; heading: string }[] = [
  { type: "synonym", heading: "Synonyms" },
  { type: "antonym", heading: "Antonyms" },
  { type: "related", heading: "Related" },
];

// Compact rendering (heading-per-type, no card wrapper) — used where relations
// sit inside an existing card, e.g. the lesson "learn" step. The detail page
// instead maps GRAMMAR_RELATION_SECTIONS itself, one full-width card per type.
export function GrammarRelations({ relations }: { relations: GrammarRelationDTO[] }) {
  return (
    <>
      {GRAMMAR_RELATION_SECTIONS.map(({ type, heading }) => {
        const items = relations.filter((r) => r.relationshipType === type);
        if (items.length === 0) return null;
        return (
          <div key={type}>
            <h2 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {heading}
            </h2>
            <ul className="space-y-3">
              {items.map((r, i) => (
                <li key={i} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <Link
                    href={`/grammar/${encodeURIComponent(r.otherSlug)}`}
                    className="text-base font-medium text-emerald-700 hover:underline"
                    lang="ja"
                  >
                    {r.otherTitle}
                  </Link>
                  <span className="ml-2 text-sm text-slate-400">{r.otherMeaning}</span>
                  <p className="mt-1 text-sm text-slate-600">{r.body}</p>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}
