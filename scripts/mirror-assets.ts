// Mirrors every asset referenced by the Subject table into a Cloudflare R2
// bucket and repoints the row at the bucket's public URL, so the app does not
// depend on files.wanikani.com at runtime. For personal local study use only —
// do not redistribute the uploaded files.
//
//   - characterImage (radicals): the SVG glyph variant (the PNG variants are
//     CDN-signed and already 403) → radical-images/{slug}-char.svg
//   - audioUrls (vocab): every audio/mpeg clip → audio/{subjectId}-{i}.mp3,
//     rewriting the JSON to the public URLs and keeping the reading/voice-actor
//     metadata. webm variants are dropped — every subject ships mp3, and the
//     players prefer it anyway.
//
// Rows still pointing at the retired local mirror (/radical-images/…,
// /audio/…) are migrated too: the object is uploaded from public/ instead of
// re-downloaded from WaniKani.
//
// Usage: npm run mirror:assets
// Safe to re-run: already-uploaded objects and already-repointed rows are
// skipped. Run it again after a content sync to mirror newly added assets.

import { PrismaClient } from "@prisma/client";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { readFile } from "fs/promises";
import path from "path";
import type { PronunciationAudio } from "../lib/audio";

const missing = [
  "WANIKANI_API_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Not set (expected in .env): ${missing.join(", ")}`);
  process.exit(1);
}

const prisma = new PrismaClient();
const API_KEY = process.env.WANIKANI_API_KEY!;
const BUCKET = process.env.R2_BUCKET!;
const BASE = process.env.R2_PUBLIC_BASE_URL!.replace(/\/+$/, "");
const AUDIO_CONCURRENCY = 8;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const publicUrl = (key: string) => `${BASE}/${key}`;

/** Every key already in the bucket, so re-runs skip finished uploads. */
async function listExistingKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token }),
    );
    for (const o of page.Contents ?? []) keys.add(o.Key!);
    token = page.NextContinuationToken;
  } while (token);
  return keys;
}

let existingKeys: Set<string>;

async function upload(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Objects are content-addressed by subject/clip and never rewritten.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  existingKeys.add(key);
}

async function download(url: string, attempt = 1): Promise<Buffer> {
  const res = await fetch(url);
  if (res.status === 429 && attempt <= 5) {
    await new Promise((r) => setTimeout(r, 15_000 * attempt));
    return download(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} on ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Asset bytes: from the retired local mirror for /… paths, downloaded otherwise. */
async function getBody(url: string): Promise<Buffer> {
  if (url.startsWith("/")) return readFile(path.join(process.cwd(), "public", url));
  return download(url);
}

// ---------------------------------------------------------------------------
// Radical character images
// ---------------------------------------------------------------------------

interface WKRadical {
  id: number;
  data: {
    slug: string;
    character_images?: { url: string; content_type: string }[];
  };
}

/** id → public SVG URL for every radical, from the (paged) subjects endpoint. */
async function fetchSvgUrls(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  let url: string | null = "https://api.wanikani.com/v2/subjects?types=radical";
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}`, "Wanikani-Revision": "20170710" },
    });
    if (!res.ok) throw new Error(`WaniKani API ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as {
      pages: { next_url: string | null };
      data: WKRadical[];
    };
    for (const r of body.data) {
      const svg = r.data.character_images?.find((i) => i.content_type === "image/svg+xml");
      if (svg) map.set(r.id, svg.url);
    }
    url = body.pages.next_url;
  }
  return map;
}

async function mirrorRadicalImages(): Promise<string[]> {
  const radicals = (
    await prisma.subject.findMany({
      where: { type: "radical", characterImage: { not: null } },
      select: { id: true, slug: true, characterImage: true },
      orderBy: { level: "asc" },
    })
  ).filter((r) => !r.characterImage!.startsWith(BASE));
  console.log(`[images] ${radicals.length} radicals not on R2 yet`);
  if (radicals.length === 0) return [];

  // The DB stores PNG URLs for WaniKani-hosted rows; the SVG variant has to
  // come from the API. Local-mirror rows already are the SVG file.
  const needApi = radicals.some((r) => !r.characterImage!.startsWith("/"));
  const svgUrls = needApi ? await fetchSvgUrls() : new Map<number, string>();
  const failed: string[] = [];

  for (const radical of radicals) {
    const src = radical.characterImage!;
    const key = src.startsWith("/")
      ? `radical-images/${path.basename(src)}`
      : `radical-images/${radical.slug}-char.svg`;
    try {
      if (!existingKeys.has(key)) {
        let body: Buffer;
        if (src.startsWith("/")) {
          body = await getBody(src);
        } else {
          const svgUrl = svgUrls.get(radical.id);
          if (!svgUrl) throw new Error("no SVG variant in the API response");
          body = await download(svgUrl);
          await new Promise((r) => setTimeout(r, 150));
        }
        await upload(key, body, "image/svg+xml");
      }
      await prisma.subject.update({
        where: { id: radical.id },
        data: { characterImage: publicUrl(key) },
      });
    } catch (e) {
      failed.push(radical.slug);
      console.error(`[images] ${radical.slug}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`[images] done: ${radicals.length - failed.length} mirrored, ${failed.length} failed`);
  return failed;
}

// ---------------------------------------------------------------------------
// Pronunciation audio
// ---------------------------------------------------------------------------

async function mirrorSubjectAudio(subject: { id: number; audioUrls: string | null }): Promise<void> {
  const clips = JSON.parse(subject.audioUrls!) as PronunciationAudio[];
  const mpeg = clips.filter((c) => c.contentType === "audio/mpeg");
  const keep = mpeg.length > 0 ? mpeg : clips; // every subject has mp3 today; belt and braces
  const ext = mpeg.length > 0 ? "mp3" : "webm";

  const mirrored: PronunciationAudio[] = [];
  for (const [i, clip] of keep.entries()) {
    if (clip.url.startsWith(BASE)) {
      mirrored.push(clip);
      continue;
    }
    const key = clip.url.startsWith("/")
      ? `audio/${path.basename(clip.url)}`
      : `audio/${subject.id}-${i}.${ext}`;
    if (!existingKeys.has(key)) {
      await upload(key, await getBody(clip.url), clip.contentType);
    }
    mirrored.push({ ...clip, url: publicUrl(key) });
  }

  await prisma.subject.update({
    where: { id: subject.id },
    data: { audioUrls: JSON.stringify(mirrored) },
  });
}

async function mirrorAudio(): Promise<number[]> {
  const subjects = (
    await prisma.subject.findMany({
      where: { audioUrls: { not: null } },
      select: { id: true, audioUrls: true },
      orderBy: { id: "asc" },
    })
  ).filter((s) =>
    (JSON.parse(s.audioUrls!) as PronunciationAudio[]).some((c) => !c.url.startsWith(BASE)),
  );
  console.log(`[audio] ${subjects.length} subjects not fully on R2 yet`);

  const failed: number[] = [];
  let done = 0;
  const queue = [...subjects];

  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      try {
        await mirrorSubjectAudio(s);
      } catch (e) {
        failed.push(s.id);
        console.error(`[audio] subject ${s.id}: ${e instanceof Error ? e.message : e}`);
      }
      done++;
      if (done % 250 === 0) console.log(`[audio] ${done}/${subjects.length} subjects…`);
    }
  };
  await Promise.all(Array.from({ length: AUDIO_CONCURRENCY }, worker));

  console.log(`[audio] done: ${subjects.length - failed.length} mirrored, ${failed.length} failed`);
  return failed;
}

async function main() {
  existingKeys = await listExistingKeys();
  console.log(`[r2] ${existingKeys.size} objects already in ${BUCKET}`);

  const failedImages = await mirrorRadicalImages();
  const failedAudio = await mirrorAudio();

  if (failedImages.length) console.log("Failed image slugs:", failedImages.join(", "));
  if (failedAudio.length) console.log("Failed audio subject ids:", failedAudio.join(", "));
  if (failedImages.length || failedAudio.length) {
    console.log("Re-run `npm run mirror:assets` to retry the failures.");
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
