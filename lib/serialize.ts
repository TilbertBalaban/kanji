import type { Subject } from "@prisma/client";
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
  meaningMnemonic: string;
  meaningHint: string | null;
  readingMnemonic: string | null;
  readingHint: string | null;
  contextSentences: { en: string; ja: string }[];
  partsOfSpeech: string[];
  audioUrls: { url: string; contentType: string }[];
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

export function primaryMeaning(dto: SubjectDTO): string {
  return dto.meanings.find((m) => m.primary)?.meaning ?? dto.meanings[0]?.meaning ?? "";
}

export function primaryReading(dto: SubjectDTO): string | null {
  if (dto.readings.length === 0) return null;
  return dto.readings.find((r) => r.primary)?.reading ?? dto.readings[0].reading;
}
