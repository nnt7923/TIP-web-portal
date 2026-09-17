-- CreateEnum
CREATE TYPE "StudentInternshipStatus" AS ENUM ('NOT_ASSIGNED', 'READY', 'APPLYING', 'PLACED', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "majorId" TEXT NOT NULL,
    "studentCode" TEXT NOT NULL,
    "semester" INTEGER,
    "className" TEXT,
    "cvUrl" TEXT,
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentInternship" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "internshipPeriodId" TEXT NOT NULL,
    "status" "StudentInternshipStatus" NOT NULL DEFAULT 'READY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentInternship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Student_accountId_key" ON "Student"("accountId");

-- CreateIndex
CREATE INDEX "Student_universityId_idx" ON "Student"("universityId");

-- CreateIndex
CREATE INDEX "Student_majorId_idx" ON "Student"("majorId");

-- CreateIndex
CREATE INDEX "Student_status_idx" ON "Student"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Student_universityId_studentCode_key" ON "Student"("universityId", "studentCode");

-- CreateIndex
CREATE INDEX "StudentInternship_internshipPeriodId_idx" ON "StudentInternship"("internshipPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentInternship_studentId_internshipPeriodId_key" ON "StudentInternship"("studentId", "internshipPeriodId");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_majorId_fkey" FOREIGN KEY ("majorId") REFERENCES "Major"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentInternship" ADD CONSTRAINT "StudentInternship_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentInternship" ADD CONSTRAINT "StudentInternship_internshipPeriodId_fkey" FOREIGN KEY ("internshipPeriodId") REFERENCES "InternshipPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
