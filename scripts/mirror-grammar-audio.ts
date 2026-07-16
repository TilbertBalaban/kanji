// Mirrors GrammarSentence audio still hosted on Bunpro's CDN into the
// Cloudflare R2 bucket and repoints the rows (see lib/grammar-asset-mirror.ts).
//
// Usage: npm run mirror:grammar-audio
// Safe to re-run: already-mirrored rows are skipped.

import { prisma } from "../lib/db";
import { mirrorGrammarAudioToR2 } from "../lib/grammar-asset-mirror";

async function main() {
  const result = await mirrorGrammarAudioToR2(console.log);
  if (result.failed.length) {
    console.log("Failed grammar sentence ids:", result.failed.join(", "));
    console.log("Re-run `npm run mirror:grammar-audio` to retry the failures.");
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
