// Syncs SRS progress AND User Synonyms FROM the real WaniKani account (whoever
// owns WANIKANI_API_KEY) INTO a local user, rewriting that user's state.
// One-directional: WaniKani -> this app. Content must already be seeded
// (see scripts/seed.ts). Shared logic lives in lib/wanikani-sync.ts.
//
// Usage: npm run sync            (defaults to the "Tilbert" local user)
//        npm run sync -- Kate    (sync into a different local user)

import { prisma } from "../lib/db";
import { isUserId } from "../lib/users";
import { syncFromWaniKani } from "../lib/wanikani-sync";

const API_KEY = process.env.WANIKANI_API_KEY;
if (!API_KEY) {
  console.error("WANIKANI_API_KEY is not set (expected in .env)");
  process.exit(1);
}

const userId = process.argv[2] ?? "Tilbert";
if (!isUserId(userId)) {
  console.error(`Unknown user "${userId}" — see USER_IDS in lib/users.ts`);
  process.exit(1);
}

syncFromWaniKani(API_KEY, userId, console.log)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
