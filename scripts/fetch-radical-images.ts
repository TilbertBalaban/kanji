// Downloads the mnemonic artwork for each radical from its public
// wanikani.com page into public/radical-images/ and records the local path
// on the Subject row. For personal local study use only — do not redistribute.
//
// Usage: npm run fetch:radical-images
// Safe to re-run: already-downloaded radicals are skipped.

import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const prisma = new PrismaClient();
const OUT_DIR = path.join(process.cwd(), "public", "radical-images");
const DELAY_MS = 500; // be polite: ~2 pages/sec

const IMAGE_RE = /<wk-mnemonic-image\s+src="(https:\/\/files\.wanikani\.com\/[^"]+)"/;

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchImageUrl(slug: string): Promise<string | null> {
  const res = await fetch(`https://www.wanikani.com/radicals/${slug}`, {
    headers: { "User-Agent": "personal-local-srs-image-fetch" },
  });
  if (!res.ok) return null;
  const match = (await res.text()).match(IMAGE_RE);
  return match?.[1] ?? null;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const radicals = await prisma.subject.findMany({
    where: { type: "radical", mnemonicImage: null },
    select: { id: true, slug: true },
    orderBy: { level: "asc" },
  });
  console.log(`${radicals.length} radicals without a mnemonic image`);

  let ok = 0;
  const failed: string[] = [];

  for (const [i, radical] of radicals.entries()) {
    try {
      const imageUrl = await fetchImageUrl(radical.slug);
      if (!imageUrl) {
        failed.push(radical.slug);
        continue;
      }

      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) {
        failed.push(radical.slug);
        continue;
      }
      const contentType = imgRes.headers.get("content-type")?.split(";")[0] ?? "";
      const ext = EXT_BY_CONTENT_TYPE[contentType] ?? "png";
      const filename = `${radical.slug}.${ext}`;
      await writeFile(
        path.join(OUT_DIR, filename),
        Buffer.from(await imgRes.arrayBuffer()),
      );

      await prisma.subject.update({
        where: { id: radical.id },
        data: { mnemonicImage: `/radical-images/${filename}` },
      });
      ok++;
      if ((i + 1) % 25 === 0) console.log(`${i + 1}/${radicals.length} processed…`);
    } catch (e) {
      failed.push(radical.slug);
      console.error(`error on ${radical.slug}:`, e);
    }
    await sleep(DELAY_MS);
  }

  console.log(`Done: ${ok} downloaded, ${failed.length} failed.`);
  if (failed.length) console.log("Failed slugs:", failed.join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
