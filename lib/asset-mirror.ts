// Mirrors WaniKani-hosted assets referenced by the Subject table into the
// Cloudflare R2 bucket and repoints the rows at the bucket's public URLs, so
// the app never depends on files.wanikani.com at runtime — a WaniKani outage
// can only ever block syncing, not the app. Runs inside the weekly content
// cron right after each sync (new subjects arrive with WaniKani URLs) and via
// scripts/mirror-assets.ts. Must stay free of next/headers so the standalone
// script can import it. The mirrored files are for personal study use only —
// do not redistribute them.
//
//   - characterImage (radicals) → radical-images/{slug}-char.svg
//   - audioUrls (vocab): every audio/mpeg clip → audio/{subjectId}-{i}.mp3,
//     rewriting the JSON to the public URLs and keeping the reading/voice-actor
//     metadata. webm variants are dropped — every subject ships mp3, and the
//     players prefer it anyway.
//
// Failed rows keep their WaniKani URL, so the next run retries them.

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "./db";
import type { PronunciationAudio } from "./audio";

const AUDIO_CONCURRENCY = 4;

export interface AssetMirrorResult {
  imagesMirrored: number;
  audioSubjectsMirrored: number;
  /** Subject ids whose assets could not be mirrored (row left on WaniKani). */
  failed: number[];
}

function r2() {
  const missing = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_PUBLIC_BASE_URL",
  ].filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`R2 is not configured — missing env: ${missing.join(", ")}`);
  }
  return {
    bucket: process.env.R2_BUCKET!,
    base: process.env.R2_PUBLIC_BASE_URL!.replace(/\/+$/, ""),
    s3: new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    }),
  };
}

async function download(
  url: string,
  attempt = 1,
): Promise<{ body: Buffer; contentType: string | null }> {
  const res = await fetch(url);
  if (res.status === 429 && attempt <= 5) {
    await new Promise((r) => setTimeout(r, 15_000 * attempt));
    return download(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} on ${url}`);
  return {
    body: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type")?.split(";")[0].trim() ?? null,
  };
}

const IMAGE_EXT_BY_TYPE: Record<string, string> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Mirror every subject still pointing at files.wanikani.com to R2 and repoint
 * the rows at the bucket's public URLs. Idempotent: already-mirrored rows
 * don't match the queries, and re-uploading a key just overwrites it.
 */
export async function mirrorAssetsToR2(
  log: (line: string) => void = () => {},
): Promise<AssetMirrorResult> {
  const { bucket, base, s3 } = r2();
  const failed: number[] = [];

  const upload = async (key: string, body: Buffer, contentType: string) => {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Objects are keyed by subject/clip and never rewritten.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return `${base}/${key}`;
  };

  // Radical character images. mapSubject prefers the SVG variant, but falls
  // back to another format when a radical ships no SVG — key and serve the
  // object by what the server actually returned, so PNG bytes are never
  // declared as image/svg+xml (browsers refuse to render that).
  const radicals = await prisma.subject.findMany({
    where: { characterImage: { contains: "wanikani" } },
    select: { id: true, slug: true, characterImage: true },
    orderBy: { level: "asc" },
  });
  if (radicals.length) log(`[images] mirroring ${radicals.length} radicals`);
  let imagesMirrored = 0;
  for (const radical of radicals) {
    try {
      const { body, contentType } = await download(radical.characterImage!);
      const type = contentType ?? "image/svg+xml";
      const ext = IMAGE_EXT_BY_TYPE[type];
      if (!ext) throw new Error(`unexpected content type ${type}`);
      const url = await upload(`radical-images/${radical.slug}-char.${ext}`, body, type);
      await prisma.subject.update({
        where: { id: radical.id },
        data: { characterImage: url },
      });
      imagesMirrored++;
    } catch (e) {
      failed.push(radical.id);
      log(`[images] ${radical.slug}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Pronunciation audio.
  const subjects = await prisma.subject.findMany({
    where: { audioUrls: { contains: "wanikani" } },
    select: { id: true, audioUrls: true },
    orderBy: { id: "asc" },
  });
  if (subjects.length) log(`[audio] mirroring ${subjects.length} subjects`);
  let audioSubjectsMirrored = 0;
  let done = 0;
  const queue = [...subjects];

  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      try {
        const clips = JSON.parse(s.audioUrls!) as PronunciationAudio[];
        const mpeg = clips.filter((c) => c.contentType === "audio/mpeg");
        const keep = mpeg.length > 0 ? mpeg : clips; // every subject has mp3 today
        const ext = mpeg.length > 0 ? "mp3" : "webm";

        const mirrored: PronunciationAudio[] = [];
        for (const [i, clip] of keep.entries()) {
          if (!clip.url.includes("wanikani")) {
            mirrored.push(clip); // already on R2
            continue;
          }
          const { body } = await download(clip.url);
          const url = await upload(`audio/${s.id}-${i}.${ext}`, body, clip.contentType);
          mirrored.push({ ...clip, url });
        }

        await prisma.subject.update({
          where: { id: s.id },
          data: { audioUrls: JSON.stringify(mirrored) },
        });
        audioSubjectsMirrored++;
      } catch (e) {
        failed.push(s.id);
        log(`[audio] subject ${s.id}: ${e instanceof Error ? e.message : e}`);
      }
      done++;
      if (done % 250 === 0) log(`[audio] ${done}/${subjects.length} subjects…`);
    }
  };
  await Promise.all(Array.from({ length: AUDIO_CONCURRENCY }, worker));

  log(
    `[mirror] done: ${imagesMirrored} images, ${audioSubjectsMirrored} audio subjects, ` +
      `${failed.length} failed`,
  );
  return { imagesMirrored, audioSubjectsMirrored, failed };
}
