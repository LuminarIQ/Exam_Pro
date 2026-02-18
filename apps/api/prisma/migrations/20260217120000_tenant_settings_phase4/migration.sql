-- Phase 4: tenant settings for AI quotas and feature controls
CREATE TABLE "TenantSettings" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL UNIQUE REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "aiMonthlyQuota" INTEGER NOT NULL DEFAULT 1000,
  "aiUsedThisMonth" INTEGER NOT NULL DEFAULT 0,
  "aiQuotaResetAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "featureFlags" JSONB,
  "branding" JSONB,
  "syllabusConfig" JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "TenantSettings" ("id", "tenantId", "aiMonthlyQuota", "aiUsedThisMonth", "aiQuotaResetAt", "createdAt", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text), t."id", 1000, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1 FROM "TenantSettings" ts WHERE ts."tenantId" = t."id"
);
