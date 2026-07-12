# Code Review — Full Repository (2026-07-12)

> **Status: all 32 items fixed (2026-07-12).** Every MUST/SHOULD/CLEANUP item below has been applied, preserving existing WaniKani semantics (SRS stages/intervals, 90% level-up rule, daily-limit + repeatable extra-lesson batches, mistakes-mode with no SRS impact, dashboard-matching stats). Verified with `npm test` (18/18) and `npm run build` (clean). Remaining lint findings (`react-hooks/set-state-in-effect` in 4 places, `no-img-element`) pre-date this review and were out of scope.

High-effort review of the whole codebase: 8 independent review angles (correctness ×3, reuse, simplification, efficiency, altitude, Next.js-conventions), candidates deduplicated and each verified against the actual code. The conventions angle found **zero** violations — the app matches the bundled Next.js 16 docs (async `params`, `proxy.ts`, Suspense around `useSearchParams`, etc.).

Legend: **MUST** = correctness/data-integrity bug, fix it. **SHOULD** = robustness/latent bug or meaningful waste. **CLEANUP** = duplication/dead code worth consolidating.

---

## MUST fix — data loss & SRS corruption

### 1. WaniKani sync can permanently wipe all user progress
`lib/wanikani-sync.ts:326-334` — the account sync rewrites user state with `assignment.deleteMany({userId})` followed by `createMany` **outside any transaction**. If anything fails between the two (Neon connection drop, timeout on a few-thousand-row insert, Vercel function duration limit), the delete is already durable and the user is left with zero assignments. `userSynonym` (line 331) has the same delete-then-create exposure, and the assignment `createMany` lacks `skipDuplicates` (the synonym one has it), so a duplicate pair or a concurrent second sync crashes mid-rewrite.
**Fix:** wrap delete+create for assignments and synonyms in one `prisma.$transaction`, and add `skipDuplicates: true` to the assignment `createMany`.

### 2. Unvalidated review payload corrupts the SRS stage model
`app/api/reviews/complete/route.ts:10-18` — only `subjectId` is type-checked; the three incorrect-count fields flow unvalidated into `nextStage()`. `lib/srs.ts:45-49` only clamps the **floor**: a negative count makes `Math.ceil(incorrect/2) * penaltyFactor` negative, so `POST {subjectId, meaningIncorrectCount: -8}` on a stage-6 item stores `srsStage` 14. `STAGE_NAMES[14]` is undefined, `nextAvailableAt(14)` returns `null` so the item silently leaves the review queue forever, and `burnedAt` is never set. Negative counts also poison ReviewLog accuracy stats. Non-numeric values yield NaN and a 422 from a Prisma error instead of a clean 400.
**Fix:** validate all three counts as integers `>= 0` (cap sanely, e.g. `<= 50`) and return 400 otherwise; additionally clamp `nextStage`'s result to `[1, BURNED_STAGE]`.

### 3. `completeReview` has no due-date, replay, or concurrency guard
`lib/progression.ts:52-58` — the only checks are "assignment exists" and "startedAt set". Nothing verifies the assignment is actually due (`availableAt <= now`), so repeated POSTs march an item from Apprentice to Burned in seconds. A double-submit (two tabs, network retry) advances the same assignment twice and double-inserts ReviewLog rows; the racing `unlockAmalgamations` check-then-create can throw P2002 → 422 after the review already committed.
**Fix:** reject when `availableAt` is null or in the future (make the read-path invariant hold on the write path); use `createMany({skipDuplicates})` or upsert for unlocks.

### 4. kana_vocabulary reviews log phantom correct answers
`lib/progression.ts:62-67` vs `app/reviews/page.tsx:38-45` — the server always writes `readingCorrectCount = 1` for non-radicals and `recallCorrectCount = 1` for vocab, but the client only asks reading/recall prompts when `readings.some(acceptedAnswer)`. kana_vocabulary subjects are stored with `readings = "[]"` (`lib/content-sync.ts:112-119`, the API sends no readings for them), so every kana_vocabulary review records 2 correct answers for prompts that were never asked — e.g. missing the meaning once records 3-correct/1-wrong (75%) instead of 1/1 (50%), permanently inflating the dashboard Correct Reviews gauge. Root cause is altitude: the "which prompts does this subject get" rule lives in three places (reviews page, lessons page `buildQuizTasks`, server `completeReview`) and has drifted.
**Fix:** one shared `tasksForSubject(subject)` in `lib/srs.ts` used by both quiz pages and `completeReview`.

### 5. Review completion errors are swallowed by the client — "↓ undefined"
`app/reviews/page.tsx:101-121` — `submitCompleted` never checks `res.ok`. On a 422/401 the error body has no `endingStage`, so the toast renders `↓ undefined` (`STAGE_NAMES[undefined]`), the item is counted as completed, and the SRS update is silently lost. Reachable today via finding #3's P2002 race, a mid-session sync (finding #1) clearing `startedAt`, or an expired session.
**Fix:** check `res.ok`, surface an error toast, and don't mark the item completed on failure.

### 6. First-login initialization race → 500s on the user's first page load
`lib/progression.ts:13-27` — `ensureUserInitialized` is check-then-create and runs via `requireUserId` (`lib/user.ts:28`) on **every** API route. A new user's dashboard fires `/api/summary`, `/api/reviews`, `/api/lessons` in parallel; all pass the `findUnique` check, then the losers' `userProgress.create` throws P2002, which propagates uncaught as a 500. The level-1 radical `createMany` lacks `skipDuplicates` too.
**Fix:** `upsert` (or `create` + catch P2002) and `skipDuplicates: true`; see also SHOULD #12 for taking it off the per-request path.

### 7. Daily lesson limit is enforced only on the read path
`app/api/lessons/complete/route.ts:9-14` + `lib/progression.ts:192-202` — `startLessons` applies every submitted subjectId with no batch cap and no `DAILY_LESSON_LIMIT` check; the limit exists only in what `GET /api/lessons` chooses to serve. A client can POST all unlocked ids and start 200 lessons in one call, flooding the review queue.
**Fix:** enforce the limit inside `startLessons` (the layer that owns the invariant), e.g. cap by `DAILY_LESSON_LIMIT + EXTRA_LESSON_BATCH - lessonsDoneToday`.

### 8. Weekly content cron reports failure after a successful sync
`app/api/cron/sync-content/route.ts:35-51` — `mirrorAssetsToR2()` runs in the same try block after `syncContentFromWaniKani`, and `r2()` (`lib/asset-mirror.ts:31-41`) throws synchronously when any `R2_*` env var is unset. The route then returns 502 and discards the successful sync result, so Vercel marks the cron failing every run and operators can't tell content sync actually worked.
**Fix:** wrap the mirror step in its own try/catch and report `assets: {error}` alongside `ok: true`, or check R2 config up front and skip mirroring with a warning.

### 9. No level cap — users can be written to level 61
`lib/progression.ts:160-166` — `maybeLevelUp` writes `currentLevel + 1` with no maximum, while level 60 is hardcoded in `app/page.tsx:281-282`, `app/levels/page.tsx`, `app/levels/[n]/page.tsx`, `app/api/levels/[n]/route.ts`, and `app/api/subject-types/[type]/route.ts`. A user passing 90% of level-60 kanji gets `currentLevel = 61`: `/api/levels/61` 400s and the level UI can't display the level the app itself assigned.
**Fix:** export `MAX_LEVEL = 60` from `lib/srs.ts` (or progression), clamp in `maybeLevelUp`, and replace every hardcoded 60.

### 10. `backfill-audio` re-points mirrored R2 audio back at WaniKani's CDN
`scripts/backfill-audio.ts:54-57` — the script (header: "Safe to re-run") unconditionally overwrites `Subject.audioUrls` with fresh WaniKani CDN URLs, ignoring the R2-preservation rule that `lib/content-sync.ts:185-187` enforces. One re-run after mirroring makes app-wide audio depend on files.wanikani.com again — exactly the outage-coupling the mirror exists to prevent.
**Fix:** skip rows whose `audioUrls` doesn't contain "wanikani" (same rule as content-sync), or delete the script now that the backfill is done.

---

## SHOULD fix — latent bugs & robustness

### 11. Daily lesson quota resets at UTC midnight, not the user's midnight
`lib/progression.ts:30-34` — `setHours(0,0,0,0)` uses the server timezone (UTC on Vercel). A user in UTC-7 who finishes 10 lessons at 4:30pm gets 10 more at 5pm; a user in UTC+9 stays blocked through their morning. Fix: store/derive the user's timezone (or use a rolling 24h window).

### 12. `ensureUserInitialized` runs on every authenticated request
`lib/user.ts:28` — every API hit pays an extra `userProgress.findUnique` round trip to re-check a one-time initialization. Fix: initialize on first touch only (memoize initialized ids per instance, or move to a Clerk webhook / sign-up flow).

### 13. `?limit=abc` yields an empty lesson batch instead of a 400
`app/api/lessons/route.ts:25,38,52` — `Number(param)` is never NaN-checked; `Math.min(NaN, remaining)` is NaN and `slice(0, NaN)` returns `[]` while `total` still reports lessons available. Fix: validate with `Number.isFinite` and fall back to the default.

### 14. NaN path params in subject routes → unhandled 500
`app/api/subjects/[id]/notes/route.ts` (and the synonyms and `[id]` routes) convert the path segment with `Number()` and pass NaN into Prisma Int filters, producing a Prisma validation error instead of a 400/404. Fix: shared `parseIntParam` helper that 400s on NaN.

### 15. srsStage 0 with `startedAt` set is bucketed as "guru"
`app/api/summary/route.ts:123-129` — the else-if chain: stage 0 fails `>= 1`, then satisfies `< 7` → guru. Locally unreachable (`nextStage` floors at 1), but the WaniKani import can write stage-0 started rows (reset/resurrected items). Currently harmless only because `stageCounts` is dead payload (see #21) — fix the chain or delete the block.

### 16. Radical images can be uploaded as PNG bytes served as `image/svg+xml`
`lib/content-sync.ts:101` falls back to the first (CDN-signed PNG) variant when a radical has no SVG image, but `lib/asset-mirror.ts:104` uploads whatever bytes it downloads under `{slug}-char.svg` with ContentType `image/svg+xml`. Browsers won't render PNG bytes declared as SVG, and once the row points at R2 the `contains: "wanikani"` query never retries it. Fix: detect the content type (or only mirror SVG URLs; store the PNG fallback un-mirrored).

### 17. Review-history rows ignore recall mistakes
`components/SubjectDetail.tsx:365-368` — hand-sums `meaningIncorrectCount + readingIncorrectCount`, omitting `recallIncorrectCount`, instead of calling `answerCounts()` from `lib/accuracy.ts`. A review failed only on the recall task shows no "(n wrong)" marker while the accuracy gauge counts it.

### 18. `scripts/fetch-radical-character-images.ts` silently records radicals as imageless
Line 40: `if (!res.ok) return null` with no 429 handling — on WaniKani's 60 req/min limit, rate-limited radicals are stored as having no image instead of being retried. Fix: reuse the shared WaniKani fetch (see #24).

---

## SHOULD fix — performance (serverless Neon: round trips dominate)

### 19. N+1 query storms in the unlock cascade
`lib/progression.ts:112-136` (`unlockAmalgamations`) and `:170-189` (`unlockLevel`) — per-candidate `findUnique` + per-candidate passed-component `count` + per-unlock `create`, all sequential, inside `POST /api/reviews/complete`. A level-up over ~120 subjects issues 200+ round trips in one request. Fix: batch-fetch existing assignments and passed component ids in two `findMany`s, decide in memory, `createMany` once.

### 20. Dashboard summary serializes ~6 independent queries
`app/api/summary/route.ts:41-107` — after the initial `Promise.all`, the passedKanji count, activeItems, recent mistakes, accuracy logs, and forecast are awaited sequentially though only passedKanji depends on a prior result. Fold them into the `Promise.all`.

### 21. Summary computes payload nobody renders
`app/api/summary/route.ts:116-144` — `stageCounts` and `levelProgress` cost three queries (srsStage groupBy, level-kanji findMany, passedKanji count) but no client reads them: `app/page.tsx:30-31` declares them in the interface and never uses them (the LevelProgress widget refetches `/api/levels/[n]` instead). Delete them (or start rendering them — then fix #15).

### 22. `GET /api/lessons` fetches every unstarted assignment with full subject rows
`app/api/lessons/route.ts:29-52` — hundreds of multi-KB rows (mnemonics, context sentences, audio JSON) transferred per poll just to sort in JS and slice ~5. Select only sort keys first, then fetch full rows for the chosen batch.

### 23. Content sync upserts ~9,000 subjects one round trip at a time
`lib/content-sync.ts:188` — per-subject `upsert` in the page loop. `existingById` is already computed: `createMany` the unknown ids and batch the updates in a `$transaction` per page.

---

## CLEANUP — duplication & dead code

### 24. Four-plus copies of the WaniKani HTTP client
`lib/wanikani-sync.ts` (`wkFetch`), `lib/content-sync.ts:63-87` (`fetchSubjectPage`), `scripts/backfill-audio.ts:28-40` (dropped the 401 message), `lib/wanikani-key.ts:31-34` (raw fetch), `scripts/fetch-radical-character-images.ts` (no 429 handling at all — see #18). Base URL, `Wanikani-Revision: 20170710`, and the 429 backoff should live in one `lib/wanikani-api.ts`; a revision bump currently requires five synchronized edits.

### 25. Quiz UI duplicated between reviews and lessons — already drifted
`app/lessons/page.tsx` quiz section duplicates `app/reviews/page.tsx:226-333` nearly line-for-line (prompt tile, meaning/reading banner, wanakana input, post-answer audio), plus identical `VOCAB_TYPES` sets and `mistakesMode` initializers. Drift is real: reviews' input has `lang={...}` (line 314) and `readOnly` after answering (line 318); lessons' copy has neither. Extract a shared `QuizCard` component + `useMistakesMode()` hook; move the task rules to `lib/srs.ts` (same fix as MUST #4).

### 26. Related-subjects projection copied three times, with drift
`app/api/lessons/route.ts:61-93` ≈ `app/api/recent-mistakes/route.ts` (verbatim) ≈ `lib/subject-detail.ts` (variant that drops the `?? meanings[0]` fallback, so a subject with no primary-flagged meaning shows text in lesson tabs but blank in detail pages). One `toRelatedSubject()` in `lib/serialize.ts`.

### 27. Dead exports shadowing live copy-paste
`lib/serialize.ts:55-61` — `primaryMeaning`/`primaryReading` have **zero callers** while the exact expression is inlined at ~6 call sites with two divergent fallback behaviors. `lib/user.ts:9` `getCurrentUserId` is likewise dead. Either call the helpers everywhere or delete them.

### 28. Dead endpoint: `/api/stats`
`app/api/stats/route.ts` — no page or component fetches it (dashboard accuracy uses `/api/summary`), yet it's still maintained (it already gained recall-count support). Delete; restore from git if a stats page ships.

### 29. SRS stage constants half-used
`lib/progression.ts:82` tests `endingStage === 9` while importing from the module that exports `BURNED_STAGE`; `app/api/summary/route.ts:123-129` mixes `GURU_STAGE` with bare 7/8/9; `lib/ui.ts` has its own `stageGroup` literals. Export one `stageGroup()` from `lib/srs.ts` and use the named constants everywhere.

### 30. Vocabulary-type membership scattered
`VOCAB_TYPES` sets in both quiz pages, inline `type === "vocabulary" || type === "kana_vocabulary"` in `lib/progression.ts:62-64`, fall-through `spreadGroup` in `app/api/summary/route.ts:13-17`. One `isVocabulary()` next to `TYPE_COLORS` in `lib/ui.ts` (WaniKani added kana_vocabulary in 2022; the next type addition currently needs 5+ edits).

### 31. Stale one-off artifacts
- `scripts/migrate-user-ids.ts` + the `migrate:user` npm script — migration completed; delete both.
- `scripts/fetch-radical-character-images.ts:59-71` — still works around "SQLite stores some as empty string" with two duplicate queries and a manual dedupe; the app runs Neon Postgres. Collapse to one `findMany` with an OR clause.
- `prisma/dev.db` (17.6 MB SQLite, untracked) — stale leftover; the app reads Neon. Delete to prevent anyone pointing `DATABASE_URL` at it.

### 32. Scripts bypass the shared Prisma client
`scripts/backfill-audio.ts:11`, `scripts/fetch-radical-images.ts`, `scripts/fetch-radical-character-images.ts` construct `new PrismaClient()` directly while other scripts import the `lib/db.ts` singleton. Any future client config (driver adapter, pooling, logging) silently won't apply to them.

---

## Suggested order of attack

1. **#1 + #2 + #3** — they interact: sync wipe creates the states that #3/#5 then mishandle. Transaction + validation + due-check is one focused PR.
2. **#4 + #25 (task rules)** — one shared `tasksForSubject()` fixes the stats bug and deletes the worst duplication.
3. **#5, #6, #7, #8, #9** — small, independent, high-value guards.
4. Performance batch: **#19-#23**.
5. Cleanup batch: **#24, #26-#32** — mostly deletions; low risk.
