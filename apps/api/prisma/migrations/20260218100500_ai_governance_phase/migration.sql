-- AI governance phase: prompt registry + generation risk metadata + question fingerprint

CREATE TABLE IF NOT EXISTS "PromptVersion" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "version" TEXT NOT NULL,
  "template" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("tenantId", "version")
);

CREATE INDEX IF NOT EXISTS "PromptVersion_tenantId_isActive_idx"
ON "PromptVersion"("tenantId", "isActive");

ALTER TABLE "Question"
  ADD COLUMN IF NOT EXISTS "contentHash" TEXT;

CREATE INDEX IF NOT EXISTS "Question_tenantId_contentHash_idx"
ON "Question"("tenantId", "contentHash");

ALTER TABLE "QuestionGenerationRequest"
  ADD COLUMN IF NOT EXISTS "provider" TEXT,
  ADD COLUMN IF NOT EXISTS "outputHash" TEXT,
  ADD COLUMN IF NOT EXISTS "aiConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "hallucinationRisk" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "plagiarismScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "rubricCompliant" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "dedupeDetected" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "QuestionGenerationRequest_tenantId_promptVersion_idx"
ON "QuestionGenerationRequest"("tenantId", "promptVersion");
