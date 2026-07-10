// Pulls WaniKani's recent subject CONTENT updates (mnemonics, readings,
// meanings, audio, …) into the local Subject table. Shared logic lives in
// lib/content-sync.ts; the deployed app runs the same sync weekly via
// /api/cron/sync-content.
//
// Usage: npm run sync:content              (last 30 days of updates)
//        npm run sync:content -- 90        (last 90 days)

import { prisma } from "../lib/db";
import { syncContentFromWaniKani } from "../lib/content-sync";

const API_KEY = process.env.WANIKANI_API_KEY;
if (!API_KEY) {
  console.error("WANIKANI_API_KEY is not set (expected in .env)");
  process.exit(1);
}

const days = Number(process.argv[2] ?? 30);
if (!Number.isFinite(days) || days <= 0) {
  console.error(`Invalid day count: ${process.argv[2]}`);
  process.exit(1);
}

async function main() {
  const updatedAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  console.log(`Fetching subjects updated after ${updatedAfter.toISOString()}`);

  const result = await syncContentFromWaniKani(
    API_KEY!,
    updatedAfter,
    console.log,
  );

  for (const s of result.updatedSubjects) {
    console.log(`  ${s.type} ${s.characters ?? `(image #${s.id})`}`);
  }
  console.log(
    `Done: ${result.upserted} subjects updated (${result.skippedHidden} hidden skipped).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
