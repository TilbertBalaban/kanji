// Seeds the local SQLite DB from the WaniKani API v2 using your personal
// API token. Content is stored locally for personal study use only.
//
// Usage: npm run seed

import { PrismaClient } from "@prisma/client";
import { mapAudioUrls, type WKPronunciationAudio } from "../lib/audio";
import { USER_IDS } from "../lib/users";

const prisma = new PrismaClient();

const API_KEY = process.env.WANIKANI_API_KEY;
if (!API_KEY) {
  console.error("WANIKANI_API_KEY is not set (expected in .env)");
  process.exit(1);
}

interface WKCollection<T> {
  pages: { next_url: string | null };
  total_count: number;
  data: T[];
}

interface WKSubject {
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

async function fetchPage(url: string, attempt = 1): Promise<WKCollection<WKSubject>> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Wanikani-Revision": "20170710",
    },
  });
  if (res.status === 429 && attempt <= 5) {
    // Rate limited (60 req/min) — wait for the window to reset.
    const wait = 15_000 * attempt;
    console.log(`  rate limited, waiting ${wait / 1000}s...`);
    await new Promise((r) => setTimeout(r, wait));
    return fetchPage(url, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`WaniKani API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function mapSubject(s: WKSubject) {
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
    contextSentences: d.context_sentences ? JSON.stringify(d.context_sentences) : null,
    partsOfSpeech: d.parts_of_speech ? JSON.stringify(d.parts_of_speech) : null,
    audioUrls: d.pronunciation_audios
      ? JSON.stringify(mapAudioUrls(d.pronunciation_audios))
      : null,
    lessonPosition: d.lesson_position ?? 0,
  };
}

async function main() {
  let url: string | null = "https://api.wanikani.com/v2/subjects";
  let imported = 0;
  let skippedHidden = 0;
  let page = 0;

  while (url) {
    page++;
    const collection: WKCollection<WKSubject> = await fetchPage(url);
    const visible = collection.data.filter((s) => !s.data.hidden_at);
    skippedHidden += collection.data.length - visible.length;

    for (const s of visible) {
      const mapped = mapSubject(s);
      await prisma.subject.upsert({
        where: { id: s.id },
        create: mapped,
        update: mapped,
      });
    }
    imported += visible.length;
    console.log(`page ${page}: ${imported} subjects imported (of ~${collection.total_count})`);
    url = collection.pages.next_url;
  }

  // Level 1 radicals start unlocked so lessons are available immediately.
  // Each user gets their own independent starting state.
  const level1Radicals = await prisma.subject.findMany({
    where: { level: 1, type: "radical" },
    select: { id: true },
  });
  const now = new Date();
  for (const userId of USER_IDS) {
    await prisma.userProgress.upsert({
      where: { userId },
      create: { userId, currentLevel: 1 },
      update: {},
    });
    for (const r of level1Radicals) {
      await prisma.assignment.upsert({
        where: { userId_subjectId: { userId, subjectId: r.id } },
        create: { userId, subjectId: r.id, unlockedAt: now },
        update: {},
      });
    }
  }

  console.log(
    `Done: ${imported} subjects (${skippedHidden} hidden skipped), ${level1Radicals.length} level-1 radicals unlocked for ${USER_IDS.length} users.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
