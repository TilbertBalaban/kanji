import type { Subject } from "@prisma/client";
import type { PronunciationAudio } from "./audio";
import type { AuxMeaning, Meaning, Reading } from "./srs";

export interface SubjectDTO {
  id: number;
  type: string;
  level: number;
  characters: string | null;
  characterImage: string | null;
  mnemonicImage: string | null;
  slug: string;
  meanings: Meaning[];
  auxMeanings: AuxMeaning[];
  readings: Reading[];
  componentIds: number[];
  amalgamationIds: number[];
  visuallySimilarIds: number[];
  meaningMnemonic: string;
  meaningHint: string | null;
  readingMnemonic: string | null;
  readingHint: string | null;
  contextSentences: { en: string; ja: string }[];
  partsOfSpeech: string[];
  audioUrls: PronunciationAudio[];
  userSynonyms: string[]; // per-user extra accepted meanings
}

export function toSubjectDTO(s: Subject, userSynonyms: string[] = []): SubjectDTO {
  return {
    id: s.id,
    type: s.type,
    level: s.level,
    characters: s.characters,
    characterImage: s.characterImage,
    mnemonicImage: s.mnemonicImage,
    slug: s.slug,
    meanings: JSON.parse(s.meanings),
    auxMeanings: JSON.parse(s.auxMeanings),
    readings: JSON.parse(s.readings),
    componentIds: JSON.parse(s.componentIds),
    amalgamationIds: JSON.parse(s.amalgamationIds),
    visuallySimilarIds: s.visuallySimilarIds ? JSON.parse(s.visuallySimilarIds) : [],
    meaningMnemonic: s.meaningMnemonic,
    meaningHint: s.meaningHint,
    readingMnemonic: s.readingMnemonic,
    readingHint: s.readingHint,
    contextSentences: s.contextSentences ? JSON.parse(s.contextSentences) : [],
    partsOfSpeech: s.partsOfSpeech ? JSON.parse(s.partsOfSpeech) : [],
    audioUrls: s.audioUrls ? JSON.parse(s.audioUrls) : [],
    userSynonyms,
  };
}

export function primaryMeaning(dto: Pick<SubjectDTO, "meanings">): string {
  return dto.meanings.find((m) => m.primary)?.meaning ?? dto.meanings[0]?.meaning ?? "";
}

export function primaryReading(dto: Pick<SubjectDTO, "readings">): string | null {
  if (dto.readings.length === 0) return null;
  return dto.readings.find((r) => r.primary)?.reading ?? dto.readings[0].reading;
}

/** The compact tile shape used for components/amalgamations/similar lists. */
export interface RelatedSubjectDTO {
  id: number;
  type: string;
  characters: string | null;
  characterImage: string | null;
  slug: string;
  primaryMeaning: string;
  primaryReading: string | null;
}

export function toRelatedSubject(
  s: Pick<Subject, "id" | "type" | "characters" | "characterImage" | "slug" | "meanings" | "readings">,
): RelatedSubjectDTO {
  return {
    id: s.id,
    type: s.type,
    characters: s.characters,
    characterImage: s.characterImage,
    slug: s.slug,
    primaryMeaning: primaryMeaning({ meanings: JSON.parse(s.meanings) }),
    primaryReading: primaryReading({ readings: JSON.parse(s.readings) }),
  };
}
