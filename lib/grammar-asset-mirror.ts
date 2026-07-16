// Mirrors GrammarSentence audio (Bunpro's CDN) into the Cloudflare R2 bucket
// and repoints the rows at the bucket's public URLs — same rationale as
// lib/asset-mirror.ts for WaniKani assets: the app should never depend on a
// third party's CDN at runtime. Run once after scripts/seed-grammar.ts (or
// via scripts/mirror-grammar-audio.ts to retry failures).
//
// Failed rows keep their Bunpro URL, so the next run retries them.

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "./db";

const AUDIO_CONCURRENCY = 4;

export interface GrammarAudioMirrorResult {
  mirrored: number;
  /** GrammarSentence ids whose audio could not be mirrored (row left on Bunpro). */
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

/**
 * Mirror every GrammarSentence audio clip not already on R2 and repoint the
 * row at the bucket's public URL. Idempotent: already-mirrored rows are
 * skipped, and re-uploading a key just overwrites it.
 */
export async function mirrorGrammarAudioToR2(
  log: (line: string) => void = () => {},
): Promise<GrammarAudioMirrorResult> {
  const { bucket, base, s3 } = r2();
  const failed: number[] = [];

  const upload = async (key: string, body: Buffer, contentType: string) => {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return `${base}/${key}`;
  };

  const candidates = await prisma.grammarSentence.findMany({
    where: { audioUrl: { not: null } },
    select: { id: true, audioUrl: true },
    orderBy: { id: "asc" },
  });
  const sentences = candidates.filter((s) => !s.audioUrl!.startsWith(base));

  if (sentences.length) log(`[grammar-audio] mirroring ${sentences.length} sentences`);
  let mirrored = 0;
  let done = 0;
  const queue = [...sentences];

  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      try {
        const { body, contentType } = await download(s.audioUrl!);
        const type = contentType ?? "audio/mpeg";
        const url = await upload(`grammar-audio/${s.id}.mp3`, body, type);
        await prisma.grammarSentence.update({
          where: { id: s.id },
          data: { audioUrl: url },
        });
        mirrored++;
      } catch (e) {
        failed.push(s.id);
        log(`[grammar-audio] sentence ${s.id}: ${e instanceof Error ? e.message : e}`);
      }
      done++;
      if (done % 250 === 0) log(`[grammar-audio] ${done}/${sentences.length} sentences…`);
    }
  };
  await Promise.all(Array.from({ length: AUDIO_CONCURRENCY }, worker));

  log(`[grammar-audio] done: ${mirrored} mirrored, ${failed.length} failed`);
  return { mirrored, failed };
}
