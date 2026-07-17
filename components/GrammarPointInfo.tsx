"use client";

// Shared rendering pieces for a grammar point's full write-up — used by both
// the /grammar/[slug] detail page and the /grammar/lessons "learn" step, so
// a lesson shows exactly the same info a user would find on the detail page.

import Link from "next/link";
import { Fragment, useRef, type ReactNode } from "react";
import { LegendInfoButton } from "@/components/GrammarLegendModal";
import { renderTagged } from "@/components/TaggedText";
import {
  GRAMMAR_BLANK,
  type GrammarAboutBlockDTO,
  type GrammarAboutExampleDTO,
  type GrammarOfflineResourceDTO,
  type GrammarOnlineResourceDTO,
  type GrammarRelationDTO,
} from "@/lib/grammar";

/**
 * An example sentence with its cloze blank filled in and highlighted — how a
 * sentence reads outside a quiz (detail page, lesson learn step, About
 * examples). Falls back to showing the blank when the answer isn't known
 * (rows seeded before the answer was scraped).
 */
export function FilledSentence({
  japanese,
  answer,
}: {
  japanese: string;
  answer?: string | null;
}) {
  const [before, after] = japanese.split(GRAMMAR_BLANK);
  if (after === undefined || !answer) return <>{japanese}</>;
  return (
    <>
      {before}
      <strong className="font-semibold text-red-600">{answer}</strong>
      {after}
    </>
  );
}

// Bunpro marks the answer's English equivalent with <strong> ("It
// <strong>is</strong> ice cream."); the scraper preserves exactly that tag.

/** English text with Bunpro's <strong> emphasis rendered as a highlight. */
export function EmphasisText({ text }: { text: string }) {
  return (
    <>
      {renderTagged(text, "strong", (content, key) => (
        <strong key={key} className="font-semibold text-red-600">
          {content}
        </strong>
      ))}
    </>
  );
}

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
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-700 text-white shadow-sm transition-colors hover:bg-red-800"
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
  answer,
}: {
  japanese: string;
  english: string;
  audioUrl: string | null;
  answer?: string | null;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl bg-slate-100 p-4">
      {audioUrl ? (
        <SentenceAudioButton url={audioUrl} />
      ) : (
        <div className="h-10 w-10 shrink-0" aria-hidden="true" />
      )}
      <div>
        <p lang="ja" className="text-lg leading-snug">
          <FilledSentence japanese={japanese} answer={answer} />
        </p>
        <p className="mt-0.5 text-sm text-slate-500">
          <EmphasisText text={english} />
        </p>
      </div>
    </div>
  );
}

// Splits a "Verb [て] + いただけませんか / Verb [て] + もらえませんか"-style
// structure string on " / " into per-form lines, bolding the grammar point
// itself the way Bunpro highlights it: the " + "-separated segment matching
// the point's title when one does (の in "Noun + の + Noun"), else the last
// segment — bolding after the last "+" alone marks the wrong segment in
// such sandwich structures.
export function StructureBlock({ structure, title }: { structure: string; title?: string }) {
  const target = (title ?? "").replace(/〜/g, "").trim();
  const lines = structure.split(" / ").filter(Boolean);
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const segs = line.split(" + ");
        let boldIdx = target ? segs.findIndex((s) => s.trim() === target) : -1;
        if (boldIdx === -1) boldIdx = segs.length > 1 ? segs.length - 1 : -1;
        return (
          <p key={i} lang="ja" className="text-lg">
            {segs.map((seg, j) => (
              <Fragment key={j}>
                {j > 0 && " + "}
                {j === boldIdx ? (
                  <strong className="font-semibold text-red-600">{seg}</strong>
                ) : (
                  seg
                )}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export function StructureHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-1.5 text-lg text-slate-800">
      {children}
      <LegendInfoButton legend="structure" label="Structure Legend" />
    </h2>
  );
}

export function AboutExamples({ examples }: { examples: GrammarAboutExampleDTO[] }) {
  if (examples.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {examples.map((ex, i) => (
        <SentenceCard
          key={i}
          japanese={ex.japanese}
          english={ex.english}
          audioUrl={ex.audioUrl}
          answer={ex.answer}
        />
      ))}
    </div>
  );
}

// Renders an About writeup's intro in Bunpro's own order — prose paragraphs
// with each cited example group appearing right after the text that
// introduces it, rather than all examples dumped after the full intro.
export function AboutIntroBlocks({ blocks }: { blocks: GrammarAboutBlockDTO[] }) {
  return (
    <>
      {blocks.map((block, i) =>
        block.type === "text" ? (
          <p key={i} className="mt-3 whitespace-pre-line leading-relaxed text-slate-700">
            {block.text}
          </p>
        ) : (
          <AboutExamples key={i} examples={block.examples} />
        ),
      )}
    </>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="ml-1 inline h-3.5 w-3.5 align-[-2px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
    </svg>
  );
}

/**
 * Bunpro's "Readings": external articles (Online) and textbook page
 * references (Offline), plus a link to the point's own Bunpro page. The
 * Bunpro link always renders, so this never collapses to nothing.
 */
export function GrammarResources({
  online,
  offline,
  slug,
}: {
  online: GrammarOnlineResourceDTO[];
  offline: GrammarOfflineResourceDTO[];
  slug: string;
}) {
  return (
    <>
      {online.length > 0 && (
        <div>
          <h2 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Online resources
          </h2>
          <ul className="space-y-2">
            {online.map((r, i) => (
              <li key={i} className="rounded-lg bg-slate-50 p-3">
                <a
                  href={r.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-sky-700 hover:underline"
                >
                  {r.description}
                  <ExternalLinkIcon />
                </a>
                <p className="text-sm text-slate-500">{r.site}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {offline.length > 0 && (
        <div>
          <h2 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Offline resources
          </h2>
          <ul className="space-y-2">
            {offline.map((r, i) => (
              <li key={i} className="rounded-lg bg-slate-50 p-3">
                <p className="font-medium text-slate-700">{r.source}</p>
                <p className="text-sm text-slate-500">{r.location}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4">
        <a
          href={`https://bunpro.jp/grammar_points/${encodeURIComponent(slug)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-sky-600 hover:underline"
        >
          View on Bunpro
          <ExternalLinkIcon />
        </a>
      </p>
    </>
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
