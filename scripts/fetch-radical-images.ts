// Downloads the mnemonic artwork for each radical from its public wanikani.com
// page, mirrors it to R2 and records the public URL on the Subject row — the
// same treatment character images and audio get in lib/asset-mirror.ts, so the
// artwork survives a deploy (public/ writes on Vercel do not) and the app never
// depends on files.wanikani.com at runtime.
// For personal local study use only — do not redistribute.
//
// Usage: npm run fetch:radical-images
// Safe to re-run: radicals that already have a mnemonic image are skipped.
//
// Only ~2/3 of radicals have artwork at all — the rest are reported as "no
// artwork on page", which is normal, not an error, and they get re-checked on
// every run (nothing records that we looked).

import { prisma } from "../lib/db";
import { IMAGE_EXT_BY_TYPE, uploadToR2 } from "../lib/asset-mirror";

const DELAY_MS = 500; // be polite: ~2 pages/sec

const IMAGE_RE = /<wk-mnemonic-image\s+src="(https:\/\/files\.wanikani\.com\/[^"]+)"/;

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
  const radicals = await prisma.subject.findMany({
    where: { type: "radical", mnemonicImage: null },
    select: { id: true, slug: true },
    orderBy: { level: "asc" },
  });
  console.log(`${radicals.length} radicals without a mnemonic image`);

  let ok = 0;
  const none: string[] = [];
  const failed: string[] = [];

  for (const [i, radical] of radicals.entries()) {
    try {
      const imageUrl = await fetchImageUrl(radical.slug);
      if (!imageUrl) {
        none.push(radical.slug); // this radical has no artwork — expected
      } else {
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) throw new Error(`${imgRes.status} on ${imageUrl}`);

        // Key and serve the object by what the server actually returned, so PNG
        // bytes are never declared as some other type.
        const contentType =
          imgRes.headers.get("content-type")?.split(";")[0].trim() ?? "image/png";
        const ext = IMAGE_EXT_BY_TYPE[contentType];
        if (!ext) throw new Error(`unexpected content type ${contentType}`);

        const url = await uploadToR2(
          `radical-images/${radical.slug}-mnemonic.${ext}`,
          Buffer.from(await imgRes.arrayBuffer()),
          contentType,
        );

        await prisma.subject.update({
          where: { id: radical.id },
          data: { mnemonicImage: url },
        });
        ok++;
      }
      if ((i + 1) % 25 === 0) console.log(`${i + 1}/${radicals.length} processed…`);
    } catch (e) {
      failed.push(radical.slug);
      console.error(`error on ${radical.slug}:`, e);
    }
    await sleep(DELAY_MS);
  }

  console.log(
    `Done: ${ok} mirrored, ${none.length} with no artwork on page, ${failed.length} failed.`,
  );
  if (failed.length) console.log("Failed slugs:", failed.join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
