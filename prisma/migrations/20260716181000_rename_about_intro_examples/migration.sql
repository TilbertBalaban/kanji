-- The column has always stored resolved example objects
-- ([{japanese, english, audioUrl}]), not bunproId ints — rename it to match.
ALTER TABLE "GrammarPoint" RENAME COLUMN "aboutIntroExampleIds" TO "aboutIntroExamples";
