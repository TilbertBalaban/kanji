// Shared logic to pull SRS progress, User Synonyms AND Recent Mistakes FROM a
// real WaniKani account INTO a local user, rewriting that user's state.
// One-directional: WaniKani -> this app. Content must already be seeded (see
// scripts/seed.ts).
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

interface WKReviewStatistic {
  id: number;
  data_updated_at: string;
  data: {
    subject_id: number;
    meaning_correct: number;
    meaning_incorrect: number;
    meaning_current_streak: number;
    reading_correct: number;
    reading_incorrect: number;
    reading_current_streak: number;
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
  recentMistakesSynced: number;
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
 * that owns `apiKey`, and import mistakes from the account's last 24h of
 * reviews as ReviewLog rows so "Recent Mistakes" matches the WaniKani
 * dashboard. Existing local assignments/synonyms for the user are replaced;
 * review logs are only added to. `log` receives human-readable progress lines
 * (defaults to no-op).
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

  // 3. Recent mistakes. WaniKani's dashboard shows subjects answered
  // incorrectly in the past 24h, but the API no longer exposes review records
  // (GET /reviews is deprecated and returns an empty collection), so they are
  // inferred from review_statistics instead: a wrong answer resets that
  // dimension's current streak and the review's eventual correct answer sets
  // it to 1, so a statistic updated in the last 24h with
  // `current_streak === 1 && incorrect > 0` means the subject's most recent
  // review contained a mistake. (Known edge: a lone correct review in the
  // window recovering from an older miss looks identical.) Each hit becomes a
  // ReviewLog row so the dashboard and Extra Study flows pick it up, keyed on
  // the statistic's update time (= last review time) to stay idempotent
  // across re-syncs and to age out of the 24h window naturally.
  const dayAgo = new Date(Date.now() - 24 * 3600_000);
  const stageBySubject = new Map(assignmentRows.map((r) => [r.subjectId, r.srsStage]));
  const mistakeRows: {
    userId: string;
    subjectId: number;
    createdAt: Date;
    startingStage: number;
    endingStage: number;
    meaningIncorrectCount: number;
    readingIncorrectCount: number;
  }[] = [];
  url = `https://api.wanikani.com/v2/review_statistics?updated_after=${dayAgo.toISOString()}`;
  page = 0;
  while (url) {
    page++;
    const collection: WKCollection<WKReviewStatistic> = await wkFetch(apiKey, url);
    for (const s of collection.data) {
      const d = s.data;
      if (d.hidden || !knownSubjectIds.has(d.subject_id)) continue;
      const meaningMissed = d.meaning_current_streak === 1 && d.meaning_incorrect > 0;
      const readingMissed = d.reading_current_streak === 1 && d.reading_incorrect > 0;
      if (!meaningMissed && !readingMissed) continue;
      const endingStage = stageBySubject.get(d.subject_id);
      if (endingStage === undefined) continue;
      mistakeRows.push({
        userId,
        subjectId: d.subject_id,
        createdAt: new Date(s.data_updated_at),
        // The API doesn't expose the pre-review stage; assume the minimum
        // one-stage drop a missed review causes.
        startingStage: endingStage + 1,
        endingStage,
        meaningIncorrectCount: meaningMissed ? 1 : 0,
        readingIncorrectCount: readingMissed ? 1 : 0,
      });
    }
    log(`review_statistics page ${page}: ${mistakeRows.length} recent mistakes detected`);
    url = collection.pages.next_url;
  }

  // 4. Rewrite the user's state: clear then insert fresh, so items no longer on
  // the WaniKani account don't linger locally. Then mirror the account level.
  await prisma.assignment.deleteMany({ where: { userId } });
  if (assignmentRows.length > 0) {
    await prisma.assignment.createMany({ data: assignmentRows });
  }

  await prisma.userSynonym.deleteMany({ where: { userId } });
  if (synonymRows.length > 0) {
    await prisma.userSynonym.createMany({ data: synonymRows, skipDuplicates: true });
  }

  // Review logs are app history, not mirrored WaniKani state, so they are
  // never cleared — only add mistake rows not already recorded (by a previous
  // sync of the same review; in-app reviews have their own timestamps).
  const existingLogs = await prisma.reviewLog.findMany({
    where: { userId, createdAt: { gte: dayAgo } },
    select: { subjectId: true, createdAt: true },
  });
  const existingKeys = new Set(
    existingLogs.map((l) => `${l.subjectId}:${l.createdAt.getTime()}`),
  );
  const newMistakes = mistakeRows.filter(
    (m) => !existingKeys.has(`${m.subjectId}:${m.createdAt.getTime()}`),
  );
  if (newMistakes.length > 0) {
    await prisma.reviewLog.createMany({ data: newMistakes });
  }

  await prisma.userProgress.upsert({
    where: { userId },
    create: { userId, currentLevel: user.data.level },
    update: { currentLevel: user.data.level },
  });

  log(
    `Done: ${assignmentRows.length} assignments, ${synonymRows.length} synonyms, ` +
      `${mistakeRows.length} recent mistakes (${newMistakes.length} new) ` +
      `for ${userId} (${skippedHidden} hidden, ${skippedUnknown} unknown-subject skipped), ` +
      `level set to ${user.data.level}.`,
  );

  return {
    username: user.data.username,
    level: user.data.level,
    assignmentsSynced: assignmentRows.length,
    synonymsSynced: synonymRows.length,
    recentMistakesSynced: mistakeRows.length,
    skippedHidden,
    skippedUnknown,
  };
}
