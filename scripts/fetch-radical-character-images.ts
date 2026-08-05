// Mirrors the SVG character glyph for each image-only radical (no `characters`)
// to R2 and repoints characterImage at the R2 public URL — the same treatment
// mnemonic artwork gets in scripts/fetch-radical-images.ts.
//
// Why: the character_images URLs stored at seed time are the PNG variants, which
// files.wanikani.com now serves as 403 (CDN-signed). The SVG variant is still
// public, so we grab that and host it on R2 so it never breaks again. (An older
// version of this script wrote into public/radical-images/ instead — that dir is
// gitignored and public/ writes don't survive a Vercel deploy, so any radicals
// still pointing there are re-mirrored too.)
//
// Usage: npm run fetch:radical-character-images
// Safe to re-run: radicals already pointing at R2 are skipped.

import { prisma } from "../lib/db";
import { uploadToR2 } from "../lib/asset-mirror";
import { WK_API_BASE, wkFetch } from "../lib/wanikani-api";

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
  // Some seeds stored "no characters" as empty string rather than NULL.
  const targets = await prisma.subject.findMany({
    where: {
      type: "radical",
      OR: [{ characters: null }, { characters: "" }],
      // Needs fixing when the stored URL is missing, still points at
      // WaniKani's CDN, or at the retired local /radical-images/ path.
      AND: {
        OR: [
          { characterImage: null },
          { characterImage: { contains: "wanikani" } },
          { characterImage: { startsWith: "/radical-images/" } },
        ],
      },
    },
    select: { id: true, slug: true },
    orderBy: { level: "asc" },
  });
  console.log(`${targets.length} image-only radicals need a mirrored character image`);

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
      const url = await uploadToR2(
        `radical-images/${radical.slug}-char.svg`,
        Buffer.from(await imgRes.arrayBuffer()),
        "image/svg+xml",
      );

      await prisma.subject.update({
        where: { id: radical.id },
        data: { characterImage: url },
      });
      ok++;
      console.log(`  ${radical.slug} -> ${url}`);
    } catch (e) {
      failed.push(radical.slug);
      console.error(`error on ${radical.slug}:`, e);
    }
    await sleep(DELAY_MS);
  }

  console.log(`Done: ${ok} mirrored, ${failed.length} failed.`);
  if (failed.length) console.log("Failed slugs:", failed.join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
