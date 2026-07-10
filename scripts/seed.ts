// Seeds the database with the full WaniKani subject catalog using your
// personal API token. Content is stored locally for personal study use only.
// Shared fetching/mapping logic lives in lib/content-sync.ts.
//
// Per-user state (level-1 radical unlocks, progress row) is created lazily on
// first sign-in by ensureUserInitialized (lib/progression.ts), so seeding is
// purely a content import.
//
// Usage: npm run seed

import { prisma } from "../lib/db";
import { syncContentFromWaniKani } from "../lib/content-sync";

const API_KEY = process.env.WANIKANI_API_KEY;
if (!API_KEY) {
  console.error("WANIKANI_API_KEY is not set (expected in .env)");
  process.exit(1);
}

async function main() {
  const result = await syncContentFromWaniKani(API_KEY!, undefined, console.log);
  console.log(
    `Done: ${result.upserted} subjects (${result.skippedHidden} hidden skipped).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
