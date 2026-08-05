-- Composite/covering indexes for the hot query paths (see schema comments):
-- subject-detail lookups by (type, characters) and slug, per-user due/lesson
-- queries on Assignment, and (userId, createdAt) scans on the review logs.
CREATE INDEX "Subject_type_characters_idx" ON "Subject"("type", "characters");
CREATE INDEX "Subject_slug_idx" ON "Subject"("slug");
CREATE INDEX "Assignment_userId_availableAt_idx" ON "Assignment"("userId", "availableAt");
CREATE INDEX "Assignment_userId_startedAt_idx" ON "Assignment"("userId", "startedAt");
CREATE INDEX "ReviewLog_userId_createdAt_idx" ON "ReviewLog"("userId", "createdAt");
CREATE INDEX "GrammarReviewLog_userId_createdAt_idx" ON "GrammarReviewLog"("userId", "createdAt");
