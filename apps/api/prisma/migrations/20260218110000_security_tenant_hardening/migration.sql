-- Security hardening: user lockout/email verification + user sessions
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "emailVerificationTokenHash" TEXT,
  ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP;

CREATE TABLE IF NOT EXISTS "UserSession" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "deviceName" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP NOT NULL,
  "revokedAt" TIMESTAMP
);

ALTER TABLE "RefreshToken"
  ADD COLUMN IF NOT EXISTS "sessionId" TEXT;

DO $$ BEGIN
  ALTER TABLE "RefreshToken"
    ADD CONSTRAINT "RefreshToken_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "UserSession"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "RefreshToken_tenantId_sessionId_idx" ON "RefreshToken"("tenantId", "sessionId");
CREATE INDEX IF NOT EXISTS "UserSession_tenantId_userId_revokedAt_idx" ON "UserSession"("tenantId", "userId", "revokedAt");
CREATE INDEX IF NOT EXISTS "User_tenantId_emailVerifiedAt_idx" ON "User"("tenantId", "emailVerifiedAt");
CREATE INDEX IF NOT EXISTS "User_tenantId_lockedUntil_idx" ON "User"("tenantId", "lockedUntil");
