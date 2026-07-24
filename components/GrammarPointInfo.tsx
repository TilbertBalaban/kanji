"use client";

// Shared rendering pieces for a grammar point's full write-up — used by both
// the /grammar/[slug] detail page and the /grammar/lessons "learn" step, so
// a lesson shows exactly the same info a user would find on the detail page.

import Link from "next/link";
import { Fragment, useRef, useState, type ReactNode } from "react";
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

// Bunpro's sentence text carries readings inline as 漢字（かな） — the kana in
// full-width parens right after the kanji run they gloss. Render them as ruby
// so the reading sits *above* the kanji (like Bunpro) instead of beside it.
const FURIGANA_RE = /([々㐀-鿿豈-﫿]+)（([ぁ-ヿー]+)）/g;

/** Japanese text with inline 漢字（かな） readings lifted into <ruby> furigana. */
export function Furigana({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(FURIGANA_RE)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    parts.push(
      <ruby key={key++}>
        {m[1]}
        <rt className="text-[0.6em] font-normal">{m[2]}</rt>
      </ruby>,
    );
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

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
  if (after === undefined || !answer) return <Furigana text={japanese} />;
  return (
    <>
      <Furigana text={before} />
      <strong className="font-semibold text-red-600">
        <Furigana text={answer} />
      </strong>
      <Furigana text={after} />
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

// --- Structure rendering -------------------------------------------------
//
// Bunpro's casual_structure / polite_structure fields carry inline markup that
// encodes color and form the way its own structure legend defines it:
//   <strong>              → the red, bold grammar term ("[な]Adjective")
//   <span class='chui'>   → the orange accent particle (the connecting "な")
//   <span class='gp-popout' data-gp-id=…> → a hover-popout link; plain color
//   <del>                 → a struck-through form (e.g. a dropped [る])
//   <sup>/<sub>, <ruby>/<rt>/<rp> → superscripts and furigana
//   <br>                  → line break between a form and its noun-modifying use
// We store the raw HTML and reproduce these here, rather than stripping it to
// plain text (which lost the colors and let a fallback bold the wrong segment).
// The source is our own trusted seed data — Bunpro's structure fields, never
// user input — so this parses a fixed, known tag set instead of sanitizing
// arbitrary HTML.

type StructureNode =
  | { type: "text"; value: string }
  | { type: "el"; tag: string; cls: string | null; children: StructureNode[] };

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m);
}

function parseStructureNodes(html: string): StructureNode[] {
  const root: StructureNode[] = [];
  const stack: Extract<StructureNode, { type: "el" }>[] = [];
  const top = () => (stack.length ? stack[stack.length - 1].children : root);
  const pushText = (raw: string) => {
    if (raw) top().push({ type: "text", value: decodeEntities(raw) });
  };

  const tagRe = /<(\/?)([a-zA-Z]+)([^>]*?)\/?>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html))) {
    pushText(html.slice(last, m.index));
    last = tagRe.lastIndex;
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (tag === "br") {
      top().push({ type: "el", tag: "br", cls: null, children: [] });
      continue;
    }
    if (closing) {
      // Pop back to the matching open tag; best-effort for any mis-nesting.
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const clsMatch = m[3].match(/class\s*=\s*['"]([^'"]*)['"]/);
    const node: Extract<StructureNode, { type: "el" }> = {
      type: "el",
      tag,
      cls: clsMatch ? clsMatch[1] : null,
      children: [],
    };
    top().push(node);
    stack.push(node);
  }
  pushText(html.slice(last));
  return root;
}

function renderStructureNodes(nodes: StructureNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}.${i}`;
    if (n.type === "text") return <Fragment key={key}>{n.value}</Fragment>;
    const kids = renderStructureNodes(n.children, key);
    switch (n.tag) {
      case "br":
        return <br key={key} />;
      case "strong":
        return (
          <strong key={key} className="font-semibold text-red-600">
            {kids}
          </strong>
        );
      case "del":
        return (
          <del key={key} className="text-slate-400 line-through">
            {kids}
          </del>
        );
      case "sup":
        return <sup key={key}>{kids}</sup>;
      case "sub":
        return <sub key={key}>{kids}</sub>;
      case "ruby":
        return <ruby key={key}>{kids}</ruby>;
      case "rt":
        return <rt key={key}>{kids}</rt>;
      case "rp":
        return <rp key={key}>{kids}</rp>;
      case "span":
        // Bunpro's "chui" (注意) class is its orange accent; every other span
        // (gp-popout links etc.) carries no color and is simply unwrapped.
        if (n.cls && n.cls.split(/\s+/).includes("chui")) {
          return (
            <span key={key} className="text-amber-500">
              {kids}
            </span>
          );
        }
        return <Fragment key={key}>{kids}</Fragment>;
      default:
        return <Fragment key={key}>{kids}</Fragment>;
    }
  });
}

/** Renders one Bunpro structure form (raw HTML) with its original colors. */
export function StructureMarkup({ html }: { html: string }) {
  return <>{renderStructureNodes(parseStructureNodes(html), "s")}</>;
}

function RegisterToggle({
  value,
  onChange,
}: {
  value: "standard" | "polite";
  onChange: (v: "standard" | "polite") => void;
}) {
  return (
    <div className="inline-flex shrink-0 rounded-full bg-slate-100 p-0.5 text-sm font-medium">
      {(["standard", "polite"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`rounded-full px-3 py-1 capitalize transition-colors ${
            value === v ? "bg-red-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

/**
 * The full Structure block — Bunpro-colored markup plus its Standard/Polite
 * register toggle, shown only when the point has a distinct polite form. Used
 * by both the lesson "learn" step (variant="lesson") and the detail page
 * (variant="detail"), which differ only in heading style.
 */
export function StructureSection({
  standard,
  polite,
  variant = "lesson",
}: {
  standard: string;
  polite: string;
  variant?: "lesson" | "detail";
}) {
  const [register, setRegister] = useState<"standard" | "polite">("standard");
  const hasPolite = polite.trim().length > 0;
  const html = register === "polite" && hasPolite ? polite : standard;
  const headingCls =
    variant === "detail"
      ? "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"
      : "flex items-center gap-1.5 text-lg text-slate-800";
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className={headingCls}>
          Structure
          <LegendInfoButton
            legend="structure"
            label="Structure Legend"
            size={variant === "detail" ? "sm" : "md"}
          />
        </h2>
        {hasPolite && <RegisterToggle value={register} onChange={setRegister} />}
      </div>
      <p lang="ja" className="text-lg leading-relaxed">
        <StructureMarkup html={html} />
      </p>
    </>
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
          href={bunproGrammarUrl(slug)}
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

/** Bunpro's canonical page for a grammar point. */
export function bunproGrammarUrl(slug: string) {
  return `https://bunpro.jp/grammar_points/${encodeURIComponent(slug)}`;
}

/**
 * Standalone "View on Bunpro" button — shown under the header on the grammar
 * detail and lesson pages. The Bunpro link also lives in Resources; this is a
 * quicker, more prominent way to reach it.
 */
export function ViewOnBunproButton({ slug }: { slug: string }) {
  return (
    <a
      href={bunproGrammarUrl(slug)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-sky-700 shadow-sm hover:bg-slate-50"
    >
      View on Bunpro
      <ExternalLinkIcon />
    </a>
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
