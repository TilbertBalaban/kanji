// Grammar (Bunpro-style) SRS: pure DTO helpers, safe to import from client
// components; the DB writes live in lib/progression.ts. A parallel subsystem
// like lib/custom-vocab.ts — reuses lib/srs.ts's stage model but never
// touches Subject/Assignment/ReviewLog.

import type { GrammarPoint, GrammarRelation, GrammarSentence } from "@prisma/client";

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
  audioUrl: string | null;
  position: number;
}

export interface GrammarAboutExampleDTO {
  japanese: string;
  english: string;
  audioUrl: string | null;
}

export interface GrammarAboutCautionDTO {
  text: string;
  examples: GrammarAboutExampleDTO[];
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
  structure: string;
  explanation: string;
  partOfSpeech: string | null;
  register: string | null;
  wordType: string;
  caution: string;
  aboutIntro: string;
  aboutIntroExamples: GrammarAboutExampleDTO[];
  aboutCautions: GrammarAboutCautionDTO[];
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
    explanation: p.explanation,
    partOfSpeech: p.partOfSpeech,
    register: p.register,
    wordType: p.wordType,
    caution: p.caution,
    aboutIntro: p.aboutIntro,
    aboutIntroExamples: JSON.parse(p.aboutIntroExamples),
    aboutCautions: JSON.parse(p.aboutCautions),
    slug: p.slug,
  };
}

export function toGrammarSentenceDTO(s: GrammarSentence): GrammarSentenceDTO {
  return {
    id: s.id,
    bunproId: s.bunproId,
    japanese: s.japanese,
    english: s.english,
    acceptedAnswers: JSON.parse(s.acceptedAnswers),
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
  return sentences[cursor % sentences.length];
}
