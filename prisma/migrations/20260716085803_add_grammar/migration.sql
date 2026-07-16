-- CreateTable
CREATE TABLE "GrammarPoint" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "jlptLevel" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "meaning" TEXT NOT NULL,
    "structure" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "partOfSpeech" TEXT,
    "register" TEXT,
    "slug" TEXT NOT NULL,

    CONSTRAINT "GrammarPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrammarSentence" (
    "id" SERIAL NOT NULL,
    "grammarPointId" INTEGER NOT NULL,
    "japanese" TEXT NOT NULL,
    "english" TEXT NOT NULL,
    "acceptedAnswers" TEXT NOT NULL,
    "audioUrl" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "GrammarSentence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrammarProgress" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "grammarPointId" INTEGER NOT NULL,
    "srsStage" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "availableAt" TIMESTAMP(3),
    "passedAt" TIMESTAMP(3),
    "burnedAt" TIMESTAMP(3),
    "sentenceCursor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GrammarProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrammarReviewLog" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "grammarPointId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startingStage" INTEGER NOT NULL,
    "endingStage" INTEGER NOT NULL,
    "incorrectCount" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GrammarReviewLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GrammarPoint_slug_key" ON "GrammarPoint"("slug");

-- CreateIndex
CREATE INDEX "GrammarPoint_sequence_idx" ON "GrammarPoint"("sequence");

-- CreateIndex
CREATE INDEX "GrammarPoint_jlptLevel_position_idx" ON "GrammarPoint"("jlptLevel", "position");

-- CreateIndex
CREATE INDEX "GrammarSentence_grammarPointId_idx" ON "GrammarSentence"("grammarPointId");

-- CreateIndex
CREATE INDEX "GrammarProgress_userId_availableAt_idx" ON "GrammarProgress"("userId", "availableAt");

-- CreateIndex
CREATE INDEX "GrammarProgress_availableAt_idx" ON "GrammarProgress"("availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "GrammarProgress_userId_grammarPointId_key" ON "GrammarProgress"("userId", "grammarPointId");

-- CreateIndex
CREATE INDEX "GrammarReviewLog_createdAt_idx" ON "GrammarReviewLog"("createdAt");

-- CreateIndex
CREATE INDEX "GrammarReviewLog_userId_idx" ON "GrammarReviewLog"("userId");

-- AddForeignKey
ALTER TABLE "GrammarSentence" ADD CONSTRAINT "GrammarSentence_grammarPointId_fkey" FOREIGN KEY ("grammarPointId") REFERENCES "GrammarPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrammarProgress" ADD CONSTRAINT "GrammarProgress_grammarPointId_fkey" FOREIGN KEY ("grammarPointId") REFERENCES "GrammarPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrammarReviewLog" ADD CONSTRAINT "GrammarReviewLog_grammarPointId_fkey" FOREIGN KEY ("grammarPointId") REFERENCES "GrammarPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
