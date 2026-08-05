// Grammar (Bunpro-style) SRS: pure DTO helpers, safe to import from client
// components; the DB writes live in lib/progression.ts. A parallel subsystem
// like lib/custom-vocab.ts — reuses lib/srs.ts's stage model but never
// touches Subject/Assignment/ReviewLog.

import type { GrammarLegend, GrammarPoint, GrammarRelation, GrammarSentence } from "@prisma/client";

// The literal placeholder every GrammarSentence.japanese carries where the
// cloze blank goes. The client locates this substring to render the gap
// instead of storing brittle character offsets (see grammar-plan.md).
export const GRAMMAR_BLANK = "＿＿＿";

export interface GrammarSentenceDTO {
  id: number;
  bunproId: number | null;
  japanese: string;
  english: string;
  acceptedAnswers: string[];
  // Wrong-but-plausible answer → hint message; a matching guess shakes with
  // the hint instead of counting as incorrect (see lib/grammar-answer-checker.ts).
  wrongAnswerHints: Record<string, string>;
  audioUrl: string | null;
  position: number;
}

export interface GrammarAboutExampleDTO {
  japanese: string;
  english: string;
  audioUrl: string | null;
  // The cloze answer, for displaying the sentence filled-in; null/absent on
  // rows seeded before the scraper captured it (falls back to the blank).
  answer?: string | null;
}

export interface GrammarAboutCautionDTO {
  text: string;
  examples: GrammarAboutExampleDTO[];
}

// A writeup's prose interleaved with the example groups Bunpro cites mid-text
// — rendered in order so examples show up right where they're referenced
// instead of all at the end (see lib/bunpro-scraper.ts's parseBlocks).
export type GrammarAboutBlockDTO =
  | { type: "text"; text: string }
  | { type: "examples"; examples: GrammarAboutExampleDTO[] };

// Bunpro's "Readings": external articles (Online) and textbook page
// references (Offline) for further study.
export interface GrammarOnlineResourceDTO {
  site: string;
  description: string;
  link: string;
}

export interface GrammarOfflineResourceDTO {
  source: string;
  location: string;
}

export interface GrammarRelationDTO {
  relationshipType: string; // "synonym" | "antonym" | "related"
  body: string;
  otherSlug: string;
  otherTitle: string;
  otherMeaning: string;
}

export interface GrammarPointDTO {
  id: number;
  title: string;
  jlptLevel: number;
  position: number;
  sequence: number;
  lessonId: number;
  lessonDescription: string;
  meaning: string;
  structure: string; // plain-text fallback; prefer structureStandard/Polite for display
  structureStandard: string; // raw Bunpro HTML — render with StructureMarkup
  structurePolite: string; // raw Bunpro HTML; "" when there's no distinct polite form
  explanation: string;
  partOfSpeech: string | null;
  register: string | null;
  wordType: string;
  caution: string;
  aboutIntroBlocks: GrammarAboutBlockDTO[];
  aboutCautions: GrammarAboutCautionDTO[];
  onlineResources: GrammarOnlineResourceDTO[];
  offlineResources: GrammarOfflineResourceDTO[];
  slug: string;
}

export function toGrammarPointDTO(p: GrammarPoint): GrammarPointDTO {
  return {
    id: p.id,
    title: p.title,
    jlptLevel: p.jlptLevel,
    position: p.position,
    sequence: p.sequence,
    lessonId: p.lessonId,
    lessonDescription: p.lessonDescription,
    meaning: p.meaning,
    structure: p.structure,
    structureStandard: p.structureStandard,
    structurePolite: p.structurePolite,
    explanation: p.explanation,
    partOfSpeech: p.partOfSpeech,
    register: p.register,
    wordType: p.wordType,
    caution: p.caution,
    aboutIntroBlocks: JSON.parse(p.aboutIntroBlocks),
    aboutCautions: JSON.parse(p.aboutCautions),
    onlineResources: JSON.parse(p.onlineResources),
    offlineResources: JSON.parse(p.offlineResources),
    slug: p.slug,
  };
}

// Bunpro's legend modals (the info dots next to Structure / Part of Speech /
// Word Type / Register, plus the All Technical Terms glossary). Render-ready:
// assembled at seed time by lib/bunpro-scraper.ts's assembleLegends and
// stored per-modal in GrammarLegend.data.
export type GrammarLegendKey =
  | "part-of-speech"
  | "word-type"
  | "register"
  | "structure"
  | "all-terms";

export interface GrammarLegendRowDTO {
  title: string; // "If you see" cell; may carry <s>…</s> (struck-through text)
  termJa?: string; // Japanese term shown under the title…
  reading?: string; // …with this furigana
  description: string; // "It means" cell
}

export interface GrammarLegendSectionDTO {
  heading?: string;
  // Bullet text may carry one <0>…</0> span; accent is that span's color.
  bullets?: { text: string; accent?: "red" | "orange" }[];
  rows?: GrammarLegendRowDTO[];
}

export interface GrammarLegendDTO {
  key: GrammarLegendKey;
  title: string;
  intro: string[];
  sections: GrammarLegendSectionDTO[];
  seeAllTerms?: boolean; // show the "See All Technical Terms" switch button
  labels: { ifYouSee: string; itMeans: string; seeAllTerms: string };
}

export function toGrammarLegendDTO(l: GrammarLegend): GrammarLegendDTO {
  return { key: l.key as GrammarLegendKey, ...JSON.parse(l.data) };
}

export function toGrammarSentenceDTO(s: GrammarSentence): GrammarSentenceDTO {
  return {
    id: s.id,
    bunproId: s.bunproId,
    japanese: s.japanese,
    english: s.english,
    acceptedAnswers: JSON.parse(s.acceptedAnswers),
    wrongAnswerHints: JSON.parse(s.wrongAnswerHints),
    audioUrl: s.audioUrl,
    position: s.position,
  };
}

export function toGrammarRelationDTO(r: GrammarRelation): GrammarRelationDTO {
  return {
    relationshipType: r.relationshipType,
    body: r.body,
    otherSlug: r.otherSlug,
    otherTitle: r.otherTitle,
    otherMeaning: r.otherMeaning,
  };
}

/** The sentence a review/mistake shows next, rotating through position order. */
export function sentenceAtCursor<T>(sentences: T[], cursor: number): T | null {
  if (sentences.length === 0) return null;
  // Double modulo so a (corrupt) negative cursor still lands in range instead
  // of indexing out of bounds and returning undefined.
  return sentences[((cursor % sentences.length) + sentences.length) % sentences.length];
}
