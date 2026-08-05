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
import { WK_API_BASE, wkFetch } from "./wanikani-api";

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

interface SnapshotRow {
  userId: string;
  subjectId: number;
  meaningCorrect: number;
  meaningIncorrect: number;
  readingCorrect: number;
  readingIncorrect: number;
  statUpdatedAt: Date;
}

interface WKUser {
  data: { username: string; level: number };
}

export interface SyncResult {
  username: string;
  level: number;
  assignmentsSynced: number;
  synonymsSynced: number;
  reviewsSynced: number;
  recentMistakesSynced: number;
  skippedHidden: number;
  skippedUnknown: number;
}

function toDate(s: string | null): Date | null {
  return s ? new Date(s) : null;
}

/**
 * Fully rewrite `userId`'s assignments and synonyms from the WaniKani account
 * that owns `apiKey`, and import the reviews done on WaniKani since the last
 * sync as ReviewLog rows, so "Recent Mistakes" and "Correct Reviews" match
 * the WaniKani dashboard. Existing local assignments/synonyms for the user
 * are replaced; review logs are only added to. `log` receives human-readable
 * progress lines (defaults to no-op).
 */
export async function syncFromWaniKani(
  apiKey: string,
  userId: string,
  log: (msg: string) => void = () => {},
): Promise<SyncResult> {
  const user = await wkFetch<WKUser>(apiKey, `${WK_API_BASE}/user`);
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

  let url: string | null = `${WK_API_BASE}/assignments`;
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
  url = `${WK_API_BASE}/study_materials`;
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

  // 3. Reviews done on WaniKani. The API no longer exposes review records
  // (GET /reviews is deprecated and returns an empty collection), so reviews
  // are reconstructed from review_statistics deltas instead: each sync stores
  // every subject's cumulative correct/incorrect answer counts as a
  // ReviewStatSnapshot, and a later sync turns "counts grew since the
  // snapshot" into one ReviewLog row covering the reviews in between —
  // incorrect deltas mark genuine mistakes (no streak guessing), and correct
  // deltas supply the correct answers the accuracy gauge needs. Rows are
  // keyed on the statistic's update time (= last review time) to stay
  // idempotent across re-syncs. The first sync only records baselines: with
  // no snapshot to diff against, lifetime totals say nothing about *when*
  // answers happened. After that every statistic has a snapshot, so a
  // statistic without one is a newly-learned subject whose whole history
  // fits the window (diff from zero).
  const prevStageBySubject = new Map(
    (
      await prisma.assignment.findMany({
        where: { userId },
        select: { subjectId: true, srsStage: true },
      })
    ).map((a) => [a.subjectId, a.srsStage]),
  );
  const snapshots = await prisma.reviewStatSnapshot.findMany({ where: { userId } });
  const snapshotBySubject = new Map(snapshots.map((s) => [s.subjectId, s]));
  const isFirstSync = snapshots.length === 0;
  // Only statistics updated since the newest snapshot can have changed; the
  // first sync fetches everything to establish baselines. A minute of overlap
  // absorbs clock skew — unchanged statistics diff to zero and are skipped.
  let statsUrl = `${WK_API_BASE}/review_statistics`;
  if (!isFirstSync) {
    const newest = new Date(
      Math.max(...snapshots.map((s) => s.statUpdatedAt.getTime())) - 60_000,
    );
    statsUrl += `?updated_after=${newest.toISOString()}`;
  }

  const stageBySubject = new Map(assignmentRows.map((r) => [r.subjectId, r.srsStage]));
  const reviewRows: {
    userId: string;
    subjectId: number;
    createdAt: Date;
    startingStage: number;
    endingStage: number;
    meaningCorrectCount: number;
    meaningIncorrectCount: number;
    readingCorrectCount: number;
    readingIncorrectCount: number;
  }[] = [];
  const freshSnapshots: SnapshotRow[] = [];
  url = statsUrl;
  page = 0;
  while (url) {
    page++;
    const collection: WKCollection<WKReviewStatistic> = await wkFetch(apiKey, url);
    for (const s of collection.data) {
      const d = s.data;
      if (d.hidden || !knownSubjectIds.has(d.subject_id)) continue;
      const statUpdatedAt = new Date(s.data_updated_at);
      freshSnapshots.push({
        userId,
        subjectId: d.subject_id,
        meaningCorrect: d.meaning_correct,
        meaningIncorrect: d.meaning_incorrect,
        readingCorrect: d.reading_correct,
        readingIncorrect: d.reading_incorrect,
        statUpdatedAt,
      });
      if (isFirstSync) continue;

      const prev = snapshotBySubject.get(d.subject_id);
      const zero = { meaningCorrect: 0, meaningIncorrect: 0, readingCorrect: 0, readingIncorrect: 0 };
      const base = prev ?? zero;
      const meaningCorrectCount = d.meaning_correct - base.meaningCorrect;
      const meaningIncorrectCount = d.meaning_incorrect - base.meaningIncorrect;
      const readingCorrectCount = d.reading_correct - base.readingCorrect;
      const readingIncorrectCount = d.reading_incorrect - base.readingIncorrect;
      const deltas = [
        meaningCorrectCount,
        meaningIncorrectCount,
        readingCorrectCount,
        readingIncorrectCount,
      ];
      // Counts shrinking means WaniKani reset the statistic (e.g. the item
      // was resurrected) — treat this pull as a fresh baseline.
      if (deltas.some((n) => n < 0)) continue;
      if (deltas.every((n) => n === 0)) continue;

      const endingStage =
        stageBySubject.get(d.subject_id) ?? prevStageBySubject.get(d.subject_id) ?? 1;
      const hadMistake = meaningIncorrectCount > 0 || readingIncorrectCount > 0;
      reviewRows.push({
        userId,
        subjectId: d.subject_id,
        createdAt: statUpdatedAt,
        // The API doesn't expose per-review stages; approximate with the
        // stage recorded at the previous sync (or the minimum move the
        // review outcome implies).
        // Clamped to the 0-9 stage model: a burned (9) item with a mistake
        // must not record a startingStage of 10.
        startingStage:
          prevStageBySubject.get(d.subject_id) ??
          (hadMistake ? Math.min(9, endingStage + 1) : Math.max(1, endingStage - 1)),
        endingStage,
        meaningCorrectCount,
        meaningIncorrectCount,
        readingCorrectCount,
        readingIncorrectCount,
      });
    }
    log(
      `review_statistics page ${page}: ${reviewRows.length} reviews reconstructed, ` +
        `${freshSnapshots.length} snapshots collected`,
    );
    url = collection.pages.next_url;
  }
  const mistakeCount = reviewRows.filter(
    (r) => r.meaningIncorrectCount > 0 || r.readingIncorrectCount > 0,
  ).length;
  if (isFirstSync) {
    log("first sync: recorded statistic baselines only — reviews accrue from the next sync");
  }

  // 4. Rewrite the user's state: clear then insert fresh, so items no longer on
  // the WaniKani account don't linger locally. One transaction — a failure
  // mid-rewrite must never leave the user with the delete committed and the
  // insert lost (i.e. zero progress). Then mirror the account level.
  await prisma.$transaction([
    prisma.assignment.deleteMany({ where: { userId } }),
    ...(assignmentRows.length > 0
      ? [prisma.assignment.createMany({ data: assignmentRows, skipDuplicates: true })]
      : []),
    prisma.userSynonym.deleteMany({ where: { userId } }),
    ...(synonymRows.length > 0
      ? [prisma.userSynonym.createMany({ data: synonymRows, skipDuplicates: true })]
      : []),
  ]);

  // Review logs are app history, not mirrored WaniKani state, so they are
  // never cleared — only add rows not already recorded (by a previous sync
  // of the same review; in-app reviews have their own timestamps).
  let newReviews: typeof reviewRows = [];
  if (reviewRows.length > 0) {
    const oldestNew = new Date(Math.min(...reviewRows.map((r) => r.createdAt.getTime())));
    const existingLogs = await prisma.reviewLog.findMany({
      where: { userId, createdAt: { gte: oldestNew } },
      select: { subjectId: true, createdAt: true },
    });
    const existingKeys = new Set(
      existingLogs.map((l) => `${l.subjectId}:${l.createdAt.getTime()}`),
    );
    newReviews = reviewRows.filter(
      (m) => !existingKeys.has(`${m.subjectId}:${m.createdAt.getTime()}`),
    );
    if (newReviews.length > 0) {
      await prisma.reviewLog.createMany({ data: newReviews });
    }
  }

  // Refresh the snapshots for every statistic this sync saw (transactional
  // for the same delete-then-create reason as the assignment rewrite).
  if (freshSnapshots.length > 0) {
    await prisma.$transaction([
      prisma.reviewStatSnapshot.deleteMany({
        where: { userId, subjectId: { in: freshSnapshots.map((s) => s.subjectId) } },
      }),
      prisma.reviewStatSnapshot.createMany({ data: freshSnapshots }),
    ]);
  }

  await prisma.userProgress.upsert({
    where: { userId },
    create: { userId, currentLevel: user.data.level },
    update: { currentLevel: user.data.level },
  });

  log(
    `Done: ${assignmentRows.length} assignments, ${synonymRows.length} synonyms, ` +
      `${reviewRows.length} WaniKani reviews reconstructed (${newReviews.length} new, ` +
      `${mistakeCount} with mistakes) for ${userId} ` +
      `(${skippedHidden} hidden, ${skippedUnknown} unknown-subject skipped), ` +
      `level set to ${user.data.level}.`,
  );

  return {
    username: user.data.username,
    level: user.data.level,
    assignmentsSynced: assignmentRows.length,
    synonymsSynced: synonymRows.length,
    reviewsSynced: reviewRows.length,
    recentMistakesSynced: mistakeCount,
    skippedHidden,
    skippedUnknown,
  };
}
