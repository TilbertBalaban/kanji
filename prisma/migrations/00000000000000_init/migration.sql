-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Subject" (
    "id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "characters" TEXT,
    "characterImage" TEXT,
    "mnemonicImage" TEXT,
    "slug" TEXT NOT NULL,
    "documentUrl" TEXT NOT NULL,
    "meanings" TEXT NOT NULL,
    "auxMeanings" TEXT NOT NULL,
    "readings" TEXT NOT NULL,
    "componentIds" TEXT NOT NULL,
    "amalgamationIds" TEXT NOT NULL,
    "meaningMnemonic" TEXT NOT NULL,
    "meaningHint" TEXT,
    "readingMnemonic" TEXT,
    "readingHint" TEXT,
    "contextSentences" TEXT,
    "partsOfSpeech" TEXT,
    "audioUrls" TEXT,
    "lessonPosition" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "srsStage" INTEGER NOT NULL DEFAULT 0,
    "unlockedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "availableAt" TIMESTAMP(3),
    "passedAt" TIMESTAMP(3),
    "burnedAt" TIMESTAMP(3),

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewLog" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startingStage" INTEGER NOT NULL,
    "endingStage" INTEGER NOT NULL,
    "meaningIncorrectCount" INTEGER NOT NULL DEFAULT 0,
    "readingIncorrectCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReviewLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProgress" (
    "userId" TEXT NOT NULL,
    "currentLevel" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "UserProgress_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "Subject_level_type_idx" ON "Subject"("level", "type");

-- CreateIndex
CREATE INDEX "Assignment_availableAt_idx" ON "Assignment"("availableAt");

-- CreateIndex
CREATE INDEX "Assignment_srsStage_idx" ON "Assignment"("srsStage");

-- CreateIndex
CREATE INDEX "Assignment_userId_idx" ON "Assignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_userId_subjectId_key" ON "Assignment"("userId", "subjectId");

-- CreateIndex
CREATE INDEX "ReviewLog_createdAt_idx" ON "ReviewLog"("createdAt");

-- CreateIndex
CREATE INDEX "ReviewLog_userId_idx" ON "ReviewLog"("userId");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLog" ADD CONSTRAINT "ReviewLog_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

