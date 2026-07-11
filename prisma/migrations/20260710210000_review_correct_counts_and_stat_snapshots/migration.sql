-- Per-dimension correct answer counts on review logs. Backfill mirrors what
-- the old accuracy formula assumed per row (1 correct answer per prompt the
-- subject type gets), so historical accuracy numbers are unchanged.
ALTER TABLE "ReviewLog" ADD COLUMN "meaningCorrectCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ReviewLog" ADD COLUMN "readingCorrectCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ReviewLog" ADD COLUMN "recallCorrectCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "ReviewLog" SET "meaningCorrectCount" = 1;
UPDATE "ReviewLog" SET "readingCorrectCount" = 1
  WHERE "subjectId" IN (SELECT "id" FROM "Subject" WHERE "type" <> 'radical');
UPDATE "ReviewLog" SET "recallCorrectCount" = 1
  WHERE "subjectId" IN (SELECT "id" FROM "Subject" WHERE "type" IN ('vocabulary', 'kana_vocabulary'));

-- Last-seen cumulative WaniKani review_statistics per (user, subject); syncs
-- diff against these to reconstruct reviews done on WaniKani.
CREATE TABLE "ReviewStatSnapshot" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "meaningCorrect" INTEGER NOT NULL,
    "meaningIncorrect" INTEGER NOT NULL,
    "readingCorrect" INTEGER NOT NULL,
    "readingIncorrect" INTEGER NOT NULL,
    "statUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewStatSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReviewStatSnapshot_userId_subjectId_key" ON "ReviewStatSnapshot"("userId", "subjectId");
CREATE INDEX "ReviewStatSnapshot_userId_idx" ON "ReviewStatSnapshot"("userId");
