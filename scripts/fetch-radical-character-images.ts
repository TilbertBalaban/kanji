// Downloads the SVG character glyph for each image-only radical (no `characters`)
// from the WaniKani API into public/radical-images/ and repoints characterImage
// at the local file.
//
// Why: the character_images URLs stored at seed time are the PNG variants, which
// files.wanikani.com now serves as 403 (CDN-signed). The SVG variant is still
// public, so we grab that and host it locally so it never breaks again.
//
// Usage: npm run fetch:radical-character-images
// Safe to re-run: radicals already pointing at a local /radical-images/ path are skipped.

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "../lib/db";
import { WK_API_BASE, wkFetch } from "../lib/wanikani-api";

const OUT_DIR = path.join(process.cwd(), "public", "radical-images");
const API_KEY = process.env.WANIKANI_API_KEY ?? "";
const DELAY_MS = 500; // be polite: ~2 req/sec

if (!API_KEY) {
  console.error("WANIKANI_API_KEY is not set (expected in .env)");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface CharacterImage {
  url: string;
  content_type: string;
}

async function fetchSvgUrl(id: number): Promise<string | null> {
  const body = await wkFetch<{ data?: { character_images?: CharacterImage[] } }>(
    API_KEY,
    `${WK_API_BASE}/subjects/${id}`,
  );
  const images = body.data?.character_images ?? [];
  return images.find((i) => i.content_type === "image/svg+xml")?.url ?? null;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  // Some seeds stored "no characters" as empty string rather than NULL.
  const targets = await prisma.subject.findMany({
    where: {
      type: "radical",
      OR: [{ characters: null }, { characters: "" }],
      // skip ones already fixed to a local path
      NOT: { characterImage: { startsWith: "/radical-images/" } },
    },
    select: { id: true, slug: true },
    orderBy: { level: "asc" },
  });
  console.log(`${targets.length} image-only radicals need a local character image`);

  let ok = 0;
  const failed: string[] = [];

  for (const radical of targets) {
    try {
      const svgUrl = await fetchSvgUrl(radical.id);
      if (!svgUrl) {
        failed.push(radical.slug);
        continue;
      }

      const imgRes = await fetch(svgUrl);
      if (!imgRes.ok) {
        failed.push(radical.slug);
        continue;
      }
      const filename = `${radical.slug}-char.svg`;
      await writeFile(
        path.join(OUT_DIR, filename),
        Buffer.from(await imgRes.arrayBuffer()),
      );

      await prisma.subject.update({
        where: { id: radical.id },
        data: { characterImage: `/radical-images/${filename}` },
      });
      ok++;
      console.log(`  ${radical.slug} -> /radical-images/${filename}`);
    } catch (e) {
      failed.push(radical.slug);
      console.error(`error on ${radical.slug}:`, e);
    }
    await sleep(DELAY_MS);
  }

  console.log(`Done: ${ok} fixed, ${failed.length} failed.`);
  if (failed.length) console.log("Failed slugs:", failed.join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
