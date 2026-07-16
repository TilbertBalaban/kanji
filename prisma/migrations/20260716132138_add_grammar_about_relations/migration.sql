-- AlterTable
ALTER TABLE "GrammarPoint"
  ADD COLUMN "wordType" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "caution" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "aboutIntro" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "aboutIntroExampleIds" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "aboutCautions" TEXT NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "GrammarSentence"
  ADD COLUMN "bunproId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "GrammarSentence_grammarPointId_position_key" ON "GrammarSentence"("grammarPointId", "position");

-- CreateTable
CREATE TABLE "GrammarRelation" (
    "id" SERIAL NOT NULL,
    "grammarPointId" INTEGER NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "otherSlug" TEXT NOT NULL,
    "otherTitle" TEXT NOT NULL,
    "otherMeaning" TEXT NOT NULL,

    CONSTRAINT "GrammarRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GrammarRelation_grammarPointId_idx" ON "GrammarRelation"("grammarPointId");

-- AddForeignKey
ALTER TABLE "GrammarRelation" ADD CONSTRAINT "GrammarRelation_grammarPointId_fkey" FOREIGN KEY ("grammarPointId") REFERENCES "GrammarPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
