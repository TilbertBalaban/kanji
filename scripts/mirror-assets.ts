// Mirrors any WaniKani-hosted assets still referenced by the Subject table
// into the Cloudflare R2 bucket and repoints the rows (see lib/asset-mirror.ts).
// The weekly content cron and `npm run sync:content` already do this after
// every sync; this script exists for manual retries after failures.
//
// Usage: npm run mirror:assets
// Safe to re-run: already-mirrored rows are skipped.

import { prisma } from "../lib/db";
import { mirrorAssetsToR2 } from "../lib/asset-mirror";

async function main() {
  const result = await mirrorAssetsToR2(console.log);
  if (result.failed.length) {
    console.log("Failed subject ids:", result.failed.join(", "));
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
