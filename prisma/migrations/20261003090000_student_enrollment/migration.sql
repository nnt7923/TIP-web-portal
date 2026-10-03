-- CreateEnum
CREATE TYPE "StudentEnrollmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "StudentEnrollment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "majorId" TEXT NOT NULL,
    "studentCode" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "status" "StudentEnrollmentStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentEnrollment_universityId_status_createdAt_idx" ON "StudentEnrollment"("universityId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StudentEnrollment_accountId_createdAt_idx" ON "StudentEnrollment"("accountId", "createdAt");

-- AddForeignKey
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_majorId_fkey" FOREIGN KEY ("majorId") REFERENCES "Major"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A personal account may have only one outstanding school request.
CREATE UNIQUE INDEX "StudentEnrollment_one_pending_per_account" ON "StudentEnrollment" ("accountId") WHERE "status" = 'PENDING';
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_semester_check" CHECK ("semester" BETWEEN 1 AND 8);
