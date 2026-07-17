-- AlterTable
ALTER TABLE "GrammarPoint" ADD COLUMN     "offlineResources" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "onlineResources" TEXT NOT NULL DEFAULT '[]';
