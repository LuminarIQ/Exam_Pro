-- Adaptive Intelligence v2 + Revision Engine v2 baseline columns
ALTER TABLE "StudentTopicRating"
  ADD COLUMN IF NOT EXISTS "ratingDeviation" DOUBLE PRECISION NOT NULL DEFAULT 350,
  ADD COLUMN IF NOT EXISTS "speedIndex" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "retentionIndex" DOUBLE PRECISION NOT NULL DEFAULT 1;

ALTER TABLE "QuestionTopicRating"
  ADD COLUMN IF NOT EXISTS "ratingDeviation" DOUBLE PRECISION NOT NULL DEFAULT 350;

ALTER TABLE "RatingHistory"
  ADD COLUMN IF NOT EXISTS "speedDelta" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "retentionDelta" DOUBLE PRECISION;

ALTER TABLE "Flashcard"
  ADD COLUMN IF NOT EXISTS "stability" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "difficultyScore" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
  ADD COLUMN IF NOT EXISTS "lapseCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "retentionScore" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "lastReviewedAt" TIMESTAMP;

CREATE INDEX IF NOT EXISTS "StudentTopicRating_tenantId_studentId_retention_idx"
ON "StudentTopicRating"("tenantId", "studentId", "retentionIndex");

CREATE INDEX IF NOT EXISTS "Flashcard_tenantId_studentId_topicId_nextReviewAt_idx"
ON "Flashcard"("tenantId", "studentId", "topicId", "nextReviewAt");
