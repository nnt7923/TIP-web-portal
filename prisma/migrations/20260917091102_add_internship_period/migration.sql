-- CreateEnum
CREATE TYPE "InternshipPeriodStatus" AS ENUM ('DRAFT', 'OPEN', 'ONGOING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "InternshipPeriod" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "applyStartDate" TIMESTAMP(3),
    "applyEndDate" TIMESTAMP(3),
    "requiredHours" INTEGER,
    "requiredWeeks" INTEGER,
    "status" "InternshipPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternshipPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InternshipPeriod_universityId_idx" ON "InternshipPeriod"("universityId");

-- CreateIndex
CREATE INDEX "InternshipPeriod_academicYearId_idx" ON "InternshipPeriod"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "InternshipPeriod_academicYearId_periodNumber_key" ON "InternshipPeriod"("academicYearId", "periodNumber");

-- AddForeignKey
ALTER TABLE "InternshipPeriod" ADD CONSTRAINT "InternshipPeriod_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternshipPeriod" ADD CONSTRAINT "InternshipPeriod_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
