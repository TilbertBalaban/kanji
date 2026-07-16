-- AlterTable
ALTER TABLE "GrammarPoint" ADD COLUMN     "lessonDescription" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lessonId" INTEGER NOT NULL DEFAULT 0;
