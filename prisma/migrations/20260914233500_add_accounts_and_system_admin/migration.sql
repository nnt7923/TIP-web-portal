ALTER TYPE "SchoolUserRole"
ADD VALUE IF NOT EXISTS 'UNIVERSITY_ADMIN';

CREATE TYPE "GlobalRole" AS ENUM ('USER', 'SYSTEM_ADMIN');
CREATE TYPE "AccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED');

CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "phone" TEXT,
  "globalRole" "GlobalRole" NOT NULL DEFAULT 'USER',
  "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "emailVerifiedAt" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Account" (
  "id",
  "username",
  "email",
  "passwordHash",
  "fullName",
  "phone",
  "globalRole",
  "status",
  "emailVerifiedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "username",
  LOWER("email"),
  "passwordHash",
  "fullName",
  "phone",
  'USER'::"GlobalRole",
  CASE
    WHEN "status"::TEXT = 'SUSPENDED' THEN 'SUSPENDED'::"AccountStatus"
    WHEN "status"::TEXT = 'INACTIVE' THEN 'INACTIVE'::"AccountStatus"
    ELSE 'ACTIVE'::"AccountStatus"
  END,
  "emailVerifiedAt",
  "createdAt",
  "updatedAt"
FROM "SchoolUser";

CREATE UNIQUE INDEX "Account_username_key" ON "Account"("username");
CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");
CREATE INDEX "Account_globalRole_idx" ON "Account"("globalRole");
CREATE INDEX "Account_status_idx" ON "Account"("status");

ALTER TABLE "SchoolUser"
ADD COLUMN "accountId" TEXT;

UPDATE "SchoolUser"
SET "accountId" = "id";

ALTER TABLE "SchoolUser"
ALTER COLUMN "accountId" SET NOT NULL;

CREATE UNIQUE INDEX "SchoolUser_accountId_key" ON "SchoolUser"("accountId");

ALTER TABLE "SchoolUser"
ADD CONSTRAINT "SchoolUser_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "SchoolUser_username_key";
DROP INDEX IF EXISTS "SchoolUser_universityId_email_key";

ALTER TABLE "SchoolUser"
DROP COLUMN "fullName",
DROP COLUMN "username",
DROP COLUMN "email",
DROP COLUMN "phone",
DROP COLUMN "passwordHash",
DROP COLUMN "emailVerifiedAt";

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

ALTER TABLE "AuditLog"
ADD CONSTRAINT "AuditLog_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "Account"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
