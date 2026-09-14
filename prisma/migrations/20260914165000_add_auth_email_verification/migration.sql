ALTER TABLE "SchoolUser"
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

UPDATE "SchoolUser"
SET "emailVerifiedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'ACTIVE';

ALTER TABLE "SchoolUser"
ALTER COLUMN "status" SET DEFAULT 'PENDING';
