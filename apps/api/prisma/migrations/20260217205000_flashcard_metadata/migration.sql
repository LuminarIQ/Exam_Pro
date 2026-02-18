-- Flashcard metadata from diagnostic question model
ALTER TABLE "Flashcard"
  ADD COLUMN IF NOT EXISTS "sourceQuestionId" TEXT,
  ADD COLUMN IF NOT EXISTS "correctValue" TEXT,
  ADD COLUMN IF NOT EXISTS "explanation" TEXT;

CREATE INDEX IF NOT EXISTS "Flashcard_tenantId_studentId_sourceQuestionId_idx"
ON "Flashcard"("tenantId", "studentId", "sourceQuestionId");
