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

const WK_REVISION = "20170710";

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

export async function fetchSubjectPage(
  apiKey: string,
  url: string,
  attempt = 1,
): Promise<WKCollection<WKSubject>> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Wanikani-Revision": WK_REVISION,
    },
  });
  if (res.status === 429 && attempt <= 5) {
    // Rate limited (60 req/min) — wait for the window to reset.
    const wait = 15_000 * attempt;
    await new Promise((r) => setTimeout(r, wait));
    return fetchSubjectPage(apiKey, url, attempt + 1);
  }
  if (res.status === 401) {
    throw new Error("WaniKani rejected the API key (401 Unauthorized)");
  }
  if (!res.ok) {
    throw new Error(`WaniKani API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export function mapSubject(s: WKSubject) {
  const d = s.data;
  const pngImage = d.character_images?.find(
    (i) => i.content_type === "image/png",
  );
  return {
    id: s.id,
    type: s.object,
    level: d.level,
    characters: d.characters,
    characterImage: pngImage?.url ?? d.character_images?.[0]?.url ?? null,
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
    ? `https://api.wanikani.com/v2/subjects?updated_after=${encodeURIComponent(updatedAfter.toISOString())}`
    : "https://api.wanikani.com/v2/subjects";

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

    for (const s of visible) {
      const mapped = mapSubject(s);
      const current = existingById.get(s.id);
      const update = { ...mapped };
      if (current?.characterImage && !current.characterImage.includes("wanikani")) {
        update.characterImage = current.characterImage;
      }
      if (current?.audioUrls && !current.audioUrls.includes("wanikani")) {
        update.audioUrls = current.audioUrls;
      }
      await prisma.subject.upsert({
        where: { id: s.id },
        create: mapped,
        update,
      });
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
