-- Tenant curated topic resources for AI insights
CREATE TABLE IF NOT EXISTS "TopicResource" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL REFERENCES "Topic"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'TENANT_CURATED',
  "priority" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "TopicResource_tenantId_topicId_isActive_priority_idx"
ON "TopicResource"("tenantId", "topicId", "isActive", "priority");
