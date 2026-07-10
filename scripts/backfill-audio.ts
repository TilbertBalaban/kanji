// One-off backfill: re-fetch pronunciation audio (with voice-actor metadata)
// for already-seeded vocabulary and rewrite each subject's audioUrls column.
// Needed because earlier seeds stored only { url, contentType } and dropped the
// reading/voice-actor metadata the UI now groups by. Safe to re-run.
//
// Usage: npm run backfill:audio   (add to package.json, or run via tsx)

import { PrismaClient } from "@prisma/client";
import { mapAudioUrls, type WKPronunciationAudio } from "../lib/audio";

const prisma = new PrismaClient();

const API_KEY = process.env.WANIKANI_API_KEY;
if (!API_KEY) {
  console.error("WANIKANI_API_KEY is not set (expected in .env)");
  process.exit(1);
}

interface WKCollection {
  pages: { next_url: string | null };
  total_count: number;
  data: {
    id: number;
    data: { pronunciation_audios?: WKPronunciationAudio[] };
  }[];
}

async function fetchPage(url: string, attempt = 1): Promise<WKCollection> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}`, "Wanikani-Revision": "20170710" },
  });
  if (res.status === 429 && attempt <= 5) {
    const wait = 15_000 * attempt;
    console.log(`  rate limited, waiting ${wait / 1000}s...`);
    await new Promise((r) => setTimeout(r, wait));
    return fetchPage(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`WaniKani API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  let url: string | null =
    "https://api.wanikani.com/v2/subjects?types=vocabulary,kana_vocabulary";
  let updated = 0;
  let page = 0;

  while (url) {
    page++;
    const collection: WKCollection = await fetchPage(url);
    for (const s of collection.data) {
      const audios = s.data.pronunciation_audios;
      if (!audios || audios.length === 0) continue;
      const res = await prisma.subject.updateMany({
        where: { id: s.id },
        data: { audioUrls: JSON.stringify(mapAudioUrls(audios)) },
      });
      updated += res.count;
    }
    console.log(`page ${page}: ${updated} subjects updated`);
    url = collection.pages.next_url;
  }

  console.log(`Done: ${updated} vocabulary subjects had audio backfilled.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
