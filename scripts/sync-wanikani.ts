// Syncs SRS progress FROM the real WaniKani account (whoever owns
// WANIKANI_API_KEY) INTO a local user's assignments. One-directional:
// WaniKani -> this app. Content must already be seeded (see scripts/seed.ts).
//
// The local Assignment model mirrors WaniKani's assignment object field for
// field, including the identical 0-9 srs_stage scale, so the mapping is direct.
//
// Usage: npm run sync            (defaults to the "Tilbert" local user)
//        npm run sync -- Kate    (sync into a different local user)

import { PrismaClient } from "@prisma/client";
import { isUserId } from "../lib/users";

const prisma = new PrismaClient();

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

interface WKCollection<T> {
  pages: { next_url: string | null };
  total_count: number;
  data: T[];
}

interface WKAssignment {
  id: number;
  data: {
    subject_id: number;
    srs_stage: number;
    unlocked_at: string | null;
    started_at: string | null;
    passed_at: string | null;
    burned_at: string | null;
    available_at: string | null;
    hidden: boolean;
  };
}

interface WKUser {
  data: { username: string; level: number };
}

async function wkFetch<T>(url: string, attempt = 1): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Wanikani-Revision": "20170710",
    },
  });
  if (res.status === 429 && attempt <= 5) {
    // Rate limited (60 req/min) — wait for the window to reset.
    const wait = 15_000 * attempt;
    console.log(`  rate limited, waiting ${wait / 1000}s...`);
    await new Promise((r) => setTimeout(r, wait));
    return wkFetch<T>(url, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`WaniKani API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function toDate(s: string | null): Date | null {
  return s ? new Date(s) : null;
}

async function main() {
  const user = await wkFetch<WKUser>("https://api.wanikani.com/v2/user");
  console.log(`WaniKani account: ${user.data.username} (level ${user.data.level})`);
  console.log(`Syncing into local user: ${userId}`);

  // Only subjects that exist locally can be assigned (FK + hidden subjects
  // were skipped at seed time). Preload the set to filter against.
  const localSubjects = await prisma.subject.findMany({ select: { id: true } });
  const knownSubjectIds = new Set(localSubjects.map((s) => s.id));

  let url: string | null = "https://api.wanikani.com/v2/assignments";
  let synced = 0;
  let skippedHidden = 0;
  let skippedUnknown = 0;
  let page = 0;

  while (url) {
    page++;
    const collection: WKCollection<WKAssignment> = await wkFetch(url);
    for (const a of collection.data) {
      const d = a.data;
      if (d.hidden) {
        skippedHidden++;
        continue;
      }
      if (!knownSubjectIds.has(d.subject_id)) {
        skippedUnknown++;
        continue;
      }
      const fields = {
        srsStage: d.srs_stage,
        unlockedAt: toDate(d.unlocked_at),
        startedAt: toDate(d.started_at),
        availableAt: toDate(d.available_at),
        passedAt: toDate(d.passed_at),
        burnedAt: toDate(d.burned_at),
      };
      await prisma.assignment.upsert({
        where: { userId_subjectId: { userId, subjectId: d.subject_id } },
        create: { userId, subjectId: d.subject_id, ...fields },
        update: fields,
      });
      synced++;
    }
    console.log(`page ${page}: ${synced} assignments synced (of ${collection.total_count})`);
    url = collection.pages.next_url;
  }

  // Mirror the WaniKani level so lesson/unlock gating matches the real account.
  await prisma.userProgress.upsert({
    where: { userId },
    create: { userId, currentLevel: user.data.level },
    update: { currentLevel: user.data.level },
  });

  console.log(
    `Done: ${synced} assignments synced for ${userId} ` +
      `(${skippedHidden} hidden, ${skippedUnknown} unknown-subject skipped), ` +
      `level set to ${user.data.level}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
