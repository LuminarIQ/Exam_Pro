-- Attempt flow hardening: lifecycle status + assigned question snapshot + answer uniqueness
DO $$ BEGIN
  CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'ABANDONED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Attempt"
  ADD COLUMN IF NOT EXISTS "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  ADD COLUMN IF NOT EXISTS "assignedQuestionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "Attempt"
SET "status" = CASE WHEN "submittedAt" IS NULL THEN 'IN_PROGRESS'::"AttemptStatus" ELSE 'SUBMITTED'::"AttemptStatus" END
WHERE "status" IS NULL;

ALTER TABLE "Attempt"
  ALTER COLUMN "assignedQuestionIds" SET NOT NULL,
  ALTER COLUMN "assignedQuestionIds" SET DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS "Attempt_tenantId_studentId_status_idx" ON "Attempt"("tenantId", "studentId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "AttemptAnswer_tenantId_attemptId_questionId_key"
ON "AttemptAnswer"("tenantId", "attemptId", "questionId");
