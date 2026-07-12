// One-off backfill: re-fetch pronunciation audio (with voice-actor metadata)
// for already-seeded vocabulary and rewrite each subject's audioUrls column.
// Needed because earlier seeds stored only { url, contentType } and dropped the
// reading/voice-actor metadata the UI now groups by. Safe to re-run.
//
// Usage: npm run backfill:audio   (add to package.json, or run via tsx)

import { mapAudioUrls, type WKPronunciationAudio } from "../lib/audio";
import { prisma } from "../lib/db";
import { WK_API_BASE, wkFetch } from "../lib/wanikani-api";

const API_KEY = process.env.WANIKANI_API_KEY ?? "";
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

async function main() {
  let url: string | null = `${WK_API_BASE}/subjects?types=vocabulary,kana_vocabulary`;
  let updated = 0;
  let page = 0;

  while (url) {
    page++;
    const collection: WKCollection = await wkFetch<WKCollection>(API_KEY, url);
    for (const s of collection.data) {
      const audios = s.data.pronunciation_audios;
      if (!audios || audios.length === 0) continue;
      const res = await prisma.subject.updateMany({
        // Only rewrite rows still pointing at files.wanikani.com — audio
        // already mirrored to R2 must keep its R2 URLs.
        where: { id: s.id, audioUrls: { contains: "wanikani" } },
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
