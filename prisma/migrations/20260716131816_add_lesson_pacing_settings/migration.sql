-- AlterTable
ALTER TABLE "UserProgress" ADD COLUMN     "dailyLessonLimit" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "grammarDailyLessonLimit" INTEGER NOT NULL DEFAULT 2;
