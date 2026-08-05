// Shared logic to pull subject CONTENT (mnemonics, readings, meanings, audio,
// …) from the WaniKani API into the local Subject table. WaniKani ships
// content updates weekly; passing `updatedAfter` fetches only subjects
// changed since then, so a scheduled run stays small and fast. Omitting it
// fetches everything (initial seed).
//
// Used by scripts/seed.ts, scripts/sync-content.ts, and the
// /api/cron/sync-content route. Must stay free of next/headers so it can be
// imported by a standalone tsx script.
//
// Hidden subjects are never written: new hidden subjects are skipped, and a
// local subject that later becomes hidden upstream is left as-is (deleting it
// would break assignments/review logs that reference it).
//
// Assets already mirrored to R2 (any non-wanikani characterImage/audioUrls)
// are preserved on update — the API would repoint them at files.wanikani.com.
// New subjects arrive with WaniKani URLs; run `npm run mirror:assets`
// afterwards to mirror them.

import { prisma } from "./db";
import { mapAudioUrls, type WKPronunciationAudio } from "./audio";
import { WK_API_BASE, wkFetch } from "./wanikani-api";

export interface WKCollection<T> {
  pages: { next_url: string | null };
  total_count: number;
  data: T[];
}

export interface WKSubject {
  id: number;
  object: string; // radical | kanji | vocabulary | kana_vocabulary
  data: {
    level: number;
    slug: string;
    document_url: string;
    characters: string | null;
    character_images?: { url: string; content_type: string }[];
    meanings: { meaning: string; primary: boolean; accepted_answer: boolean }[];
    auxiliary_meanings: { meaning: string; type: string }[];
    readings?: {
      reading: string;
      primary: boolean;
      accepted_answer: boolean;
      type?: string;
    }[];
    component_subject_ids?: number[];
    amalgamation_subject_ids?: number[];
    visually_similar_subject_ids?: number[];
    meaning_mnemonic: string;
    meaning_hint?: string | null;
    reading_mnemonic?: string | null;
    reading_hint?: string | null;
    context_sentences?: { en: string; ja: string }[];
    parts_of_speech?: string[];
    pronunciation_audios?: WKPronunciationAudio[];
    lesson_position: number;
    hidden_at: string | null;
  };
}

export function fetchSubjectPage(
  apiKey: string,
  url: string,
): Promise<WKCollection<WKSubject>> {
  return wkFetch<WKCollection<WKSubject>>(apiKey, url);
}

export function mapSubject(s: WKSubject) {
  const d = s.data;
  // Prefer the SVG variant: the PNG variants are CDN-signed and expire (403),
  // and the asset mirror re-uploads whatever URL is stored here.
  const svgImage = d.character_images?.find(
    (i) => i.content_type === "image/svg+xml",
  );
  return {
    id: s.id,
    type: s.object,
    level: d.level,
    characters: d.characters,
    characterImage: svgImage?.url ?? d.character_images?.[0]?.url ?? null,
    slug: d.slug,
    documentUrl: d.document_url,
    meanings: JSON.stringify(
      d.meanings.map((m) => ({
        meaning: m.meaning,
        primary: m.primary,
        acceptedAnswer: m.accepted_answer,
      })),
    ),
    auxMeanings: JSON.stringify(d.auxiliary_meanings ?? []),
    readings: JSON.stringify(
      (d.readings ?? []).map((r) => ({
        reading: r.reading,
        primary: r.primary,
        acceptedAnswer: r.accepted_answer,
        type: r.type,
      })),
    ),
    componentIds: JSON.stringify(d.component_subject_ids ?? []),
    amalgamationIds: JSON.stringify(d.amalgamation_subject_ids ?? []),
    visuallySimilarIds: JSON.stringify(d.visually_similar_subject_ids ?? []),
    meaningMnemonic: d.meaning_mnemonic ?? "",
    meaningHint: d.meaning_hint ?? null,
    readingMnemonic: d.reading_mnemonic ?? null,
    readingHint: d.reading_hint ?? null,
    contextSentences: d.context_sentences
      ? JSON.stringify(d.context_sentences)
      : null,
    partsOfSpeech: d.parts_of_speech ? JSON.stringify(d.parts_of_speech) : null,
    audioUrls: d.pronunciation_audios
      ? JSON.stringify(mapAudioUrls(d.pronunciation_audios))
      : null,
    lessonPosition: d.lesson_position ?? 0,
  };
}

export interface ContentSyncResult {
  upserted: number;
  skippedHidden: number;
  updatedSubjects: { id: number; type: string; characters: string | null }[];
}

/**
 * Upsert subjects from the WaniKani API. With `updatedAfter`, only subjects
 * WaniKani changed since that instant are fetched (their weekly content
 * updates); without it, the full catalog is imported.
 */
export async function syncContentFromWaniKani(
  apiKey: string,
  updatedAfter?: Date,
  log: (msg: string) => void = () => {},
): Promise<ContentSyncResult> {
  let url: string | null = updatedAfter
    ? `${WK_API_BASE}/subjects?updated_after=${encodeURIComponent(updatedAfter.toISOString())}`
    : `${WK_API_BASE}/subjects`;

  let upserted = 0;
  let skippedHidden = 0;
  const updatedSubjects: ContentSyncResult["updatedSubjects"] = [];
  let page = 0;

  while (url) {
    page++;
    const collection: WKCollection<WKSubject> = await fetchSubjectPage(
      apiKey,
      url,
    );
    const visible = collection.data.filter((s) => !s.data.hidden_at);
    skippedHidden += collection.data.length - visible.length;

    const existing = await prisma.subject.findMany({
      where: { id: { in: visible.map((s) => s.id) } },
      select: { id: true, characterImage: true, audioUrls: true },
    });
    const existingById = new Map(existing.map((e) => [e.id, e]));

    // Batch the page's writes: one createMany for brand-new subjects, one
    // transaction of updates for the rest — instead of a round trip per
    // subject (the initial seed covers ~9,000 of them).
    const newSubjects = visible.filter((s) => !existingById.has(s.id));
    if (newSubjects.length > 0) {
      await prisma.subject.createMany({
        data: newSubjects.map(mapSubject),
        skipDuplicates: true,
      });
    }
    const updates = visible
      .filter((s) => existingById.has(s.id))
      .map((s) => {
        const current = existingById.get(s.id)!;
        const update = { ...mapSubject(s) };
        if (current.characterImage && !current.characterImage.includes("wanikani")) {
          update.characterImage = current.characterImage;
        }
        if (current.audioUrls && !current.audioUrls.includes("wanikani")) {
          update.audioUrls = current.audioUrls;
        }
        return prisma.subject.update({ where: { id: s.id }, data: update });
      });
    // Chunked: a WaniKani page holds up to 1000 subjects, and a single
    // 1000-statement transaction is a likely timeout on a pooled serverless
    // Postgres — and a timeout would lose the whole page's updates.
    const UPDATE_CHUNK = 100;
    for (let i = 0; i < updates.length; i += UPDATE_CHUNK) {
      await prisma.$transaction(updates.slice(i, i + UPDATE_CHUNK));
    }
    for (const s of visible) {
      updatedSubjects.push({
        id: s.id,
        type: s.object,
        characters: s.data.characters,
      });
    }
    upserted += visible.length;
    log(
      `page ${page}: ${upserted} subjects upserted (of ${collection.total_count} changed)`,
    );
    url = collection.pages.next_url;
  }

  return { upserted, skippedHidden, updatedSubjects };
}
