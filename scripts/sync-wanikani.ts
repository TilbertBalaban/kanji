// Syncs SRS progress AND User Synonyms FROM the real WaniKani account (whoever
// owns WANIKANI_API_KEY) INTO a local user, rewriting that user's state.
// One-directional: WaniKani -> this app. Content must already be seeded
// (see scripts/seed.ts). Shared logic lives in lib/wanikani-sync.ts.
//
// Users are Clerk accounts now, so the target is a Clerk user id.
//
// Usage: npm run sync -- user_2abc123...

import { prisma } from "../lib/db";
import { syncFromWaniKani } from "../lib/wanikani-sync";

const API_KEY = process.env.WANIKANI_API_KEY;
if (!API_KEY) {
  console.error("WANIKANI_API_KEY is not set (expected in .env)");
  process.exit(1);
}

const userId = process.argv[2];
if (!userId) {
  console.error("Usage: npm run sync -- <clerk-user-id>");
  process.exit(1);
}

syncFromWaniKani(API_KEY, userId, console.log)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
