-- CreateTable
CREATE TABLE "CustomVocab" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "characters" TEXT NOT NULL,
    "meanings" TEXT NOT NULL,
    "readings" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "srsStage" INTEGER NOT NULL DEFAULT 1,
    "availableAt" TIMESTAMP(3),
    "passedAt" TIMESTAMP(3),
    "burnedAt" TIMESTAMP(3),

    CONSTRAINT "CustomVocab_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomVocab_userId_availableAt_idx" ON "CustomVocab"("userId", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomVocab_userId_characters_key" ON "CustomVocab"("userId", "characters");
