-- Replace aboutIntro (plain text) + aboutIntroExamples (JSON array) with a
-- single ordered aboutIntroBlocks JSON array, so the intro's prose/example
-- interleaving from Bunpro's writeup HTML survives — see lib/bunpro-scraper.ts.
ALTER TABLE "GrammarPoint" ADD COLUMN "aboutIntroBlocks" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "GrammarPoint" DROP COLUMN "aboutIntro";
ALTER TABLE "GrammarPoint" DROP COLUMN "aboutIntroExamples";
