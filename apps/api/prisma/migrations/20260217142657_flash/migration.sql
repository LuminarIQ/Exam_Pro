-- DropIndex
DROP INDEX IF EXISTS "Flashcard_tenantId_studentId_topicId_nextReviewAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "StudentTopicRating_tenantId_studentId_retention_idx";

-- AlterTable
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Flashcard'
      AND column_name = 'lastReviewedAt'
  ) THEN
    ALTER TABLE "Flashcard" ALTER COLUMN "lastReviewedAt" SET DATA TYPE TIMESTAMP(3);
  END IF;
END $$;
