-- DropIndex
DROP INDEX IF EXISTS "Flashcard_tenantId_studentId_topicId_nextReviewAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "StudentTopicRating_tenantId_studentId_retention_idx";

-- AlterTable
ALTER TABLE "Flashcard" ALTER COLUMN "lastReviewedAt" SET DATA TYPE TIMESTAMP(3);
