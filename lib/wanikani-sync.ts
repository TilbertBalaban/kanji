// Shared logic to pull SRS progress AND User Synonyms FROM a real WaniKani
// account INTO a local user, rewriting that user's state. One-directional:
// WaniKani -> this app. Content must already be seeded (see scripts/seed.ts).
//
// Used by both the CLI script (scripts/sync-wanikani.ts) and the /api/sync
// route (triggered from the user chooser). Must stay free of next/headers so
// it can be imported by a standalone tsx script.
//
// The local Assignment model mirrors WaniKani's assignment object field for
// field, including the identical 0-9 srs_stage scale, so the mapping is direct.
// User synonyms come from WaniKani's study_materials.meaning_synonyms.

import { prisma } from "./db";
import { normalizeSynonym } from "./synonyms";

const WK_REVISION = "20170710";

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

interface WKStudyMaterial {
  id: number;
  data: {
    subject_id: number;
    meaning_synonyms: string[];
    hidden: boolean;
  };
}

interface WKUser {
  data: { username: string; level: number };
}

export interface SyncResult {
  username: string;
  level: number;
  assignmentsSynced: number;
  synonymsSynced: number;
  skippedHidden: number;
  skippedUnknown: number;
}

async function wkFetch<T>(apiKey: string, url: string, attempt = 1): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Wanikani-Revision": WK_REVISION,
    },
  });
  if (res.status === 429 && attempt <= 5) {
    // Rate limited (60 req/min) — wait for the window to reset.
    const wait = 15_000 * attempt;
    await new Promise((r) => setTimeout(r, wait));
    return wkFetch<T>(apiKey, url, attempt + 1);
  }
  if (res.status === 401) {
    throw new Error("WaniKani rejected the API key (401 Unauthorized)");
  }
  if (!res.ok) {
    throw new Error(`WaniKani API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function toDate(s: string | null): Date | null {
  return s ? new Date(s) : null;
}

/**
 * Fully rewrite `userId`'s assignments and synonyms from the WaniKani account
 * that owns `apiKey`. Existing local assignments/synonyms for the user are
 * replaced. `log` receives human-readable progress lines (defaults to no-op).
 */
export async function syncFromWaniKani(
  apiKey: string,
  userId: string,
  log: (msg: string) => void = () => {},
): Promise<SyncResult> {
  const user = await wkFetch<WKUser>(apiKey, "https://api.wanikani.com/v2/user");
  log(`WaniKani account: ${user.data.username} (level ${user.data.level})`);
  log(`Rewriting local user: ${userId}`);

  // Only subjects that exist locally can be assigned (FK + hidden subjects were
  // skipped at seed time). Preload the set to filter against.
  const localSubjects = await prisma.subject.findMany({ select: { id: true } });
  const knownSubjectIds = new Set(localSubjects.map((s) => s.id));

  // 1. Collect assignments (SRS progress).
  const assignmentRows: {
    userId: string;
    subjectId: number;
    srsStage: number;
    unlockedAt: Date | null;
    startedAt: Date | null;
    availableAt: Date | null;
    passedAt: Date | null;
    burnedAt: Date | null;
  }[] = [];
  let skippedHidden = 0;
  let skippedUnknown = 0;

  let url: string | null = "https://api.wanikani.com/v2/assignments";
  let page = 0;
  while (url) {
    page++;
    const collection: WKCollection<WKAssignment> = await wkFetch(apiKey, url);
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
      assignmentRows.push({
        userId,
        subjectId: d.subject_id,
        srsStage: d.srs_stage,
        unlockedAt: toDate(d.unlocked_at),
        startedAt: toDate(d.started_at),
        availableAt: toDate(d.available_at),
        passedAt: toDate(d.passed_at),
        burnedAt: toDate(d.burned_at),
      });
    }
    log(`assignments page ${page}: ${assignmentRows.length} collected (of ${collection.total_count})`);
    url = collection.pages.next_url;
  }

  // 2. Collect User Synonyms from study_materials.
  const synonymRows: { userId: string; subjectId: number; synonym: string }[] = [];
  const seen = new Set<string>(); // dedupe on (subjectId, synonym) within this pull
  url = "https://api.wanikani.com/v2/study_materials";
  page = 0;
  while (url) {
    page++;
    const collection: WKCollection<WKStudyMaterial> = await wkFetch(apiKey, url);
    for (const m of collection.data) {
      const d = m.data;
      if (d.hidden || !knownSubjectIds.has(d.subject_id)) continue;
      for (const raw of d.meaning_synonyms ?? []) {
        const synonym = normalizeSynonym(raw);
        if (!synonym) continue;
        const dedupeKey = `${d.subject_id}:${synonym.toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        synonymRows.push({ userId, subjectId: d.subject_id, synonym });
      }
    }
    log(`study_materials page ${page}: ${synonymRows.length} synonyms collected (of ${collection.total_count})`);
    url = collection.pages.next_url;
  }

  // 3. Rewrite the user's state: clear then insert fresh, so items no longer on
  // the WaniKani account don't linger locally. Then mirror the account level.
  await prisma.assignment.deleteMany({ where: { userId } });
  if (assignmentRows.length > 0) {
    await prisma.assignment.createMany({ data: assignmentRows });
  }

  await prisma.userSynonym.deleteMany({ where: { userId } });
  if (synonymRows.length > 0) {
    await prisma.userSynonym.createMany({ data: synonymRows, skipDuplicates: true });
  }

  await prisma.userProgress.upsert({
    where: { userId },
    create: { userId, currentLevel: user.data.level },
    update: { currentLevel: user.data.level },
  });

  log(
    `Done: ${assignmentRows.length} assignments, ${synonymRows.length} synonyms ` +
      `for ${userId} (${skippedHidden} hidden, ${skippedUnknown} unknown-subject skipped), ` +
      `level set to ${user.data.level}.`,
  );

  return {
    username: user.data.username,
    level: user.data.level,
    assignmentsSynced: assignmentRows.length,
    synonymsSynced: synonymRows.length,
    skippedHidden,
    skippedUnknown,
  };
}
