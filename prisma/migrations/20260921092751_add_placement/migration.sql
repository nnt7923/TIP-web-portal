BEGIN;

-- CreateEnum
CREATE TYPE "PlacementStatus" AS ENUM ('PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "applicationId" TEXT,
    "opportunityId" TEXT,
    "studentInternshipId" TEXT,
    "universitySupervisorId" TEXT,
    "companySupervisorId" TEXT,
    "positionTitle" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "PlacementStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Placement_date_range_check" CHECK ("startDate" < "endDate"),
    -- A null opportunityId would otherwise bypass the composite application foreign key.
    CONSTRAINT "Placement_application_opportunity_check" CHECK ("applicationId" IS NULL OR "opportunityId" IS NOT NULL)
);

-- CreateIndex
CREATE UNIQUE INDEX "Placement_applicationId_key" ON "Placement"("applicationId");

-- CreateIndex
CREATE INDEX "Placement_universityId_idx" ON "Placement"("universityId");

-- CreateIndex
CREATE INDEX "Placement_studentId_idx" ON "Placement"("studentId");

-- CreateIndex
CREATE INDEX "Placement_companyId_idx" ON "Placement"("companyId");

-- CreateIndex
CREATE INDEX "Placement_opportunityId_idx" ON "Placement"("opportunityId");

-- CreateIndex
CREATE INDEX "Placement_studentInternshipId_idx" ON "Placement"("studentInternshipId");

-- CreateIndex
CREATE INDEX "Placement_universitySupervisorId_idx" ON "Placement"("universitySupervisorId");

-- CreateIndex
CREATE INDEX "Placement_companySupervisorId_idx" ON "Placement"("companySupervisorId");

-- CreateIndex
CREATE INDEX "Placement_status_idx" ON "Placement"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Placement_applicationId_studentId_opportunityId_key" ON "Placement"("applicationId", "studentId", "opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_id_studentId_opportunityId_key" ON "Application"("id", "studentId", "opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyUser_id_companyId_key" ON "CompanyUser"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_id_companyId_key" ON "Opportunity"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolUser_id_universityId_key" ON "SchoolUser"("id", "universityId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentInternship_id_studentId_key" ON "StudentInternship"("id", "studentId");

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_studentId_universityId_fkey" FOREIGN KEY ("studentId", "universityId") REFERENCES "Student"("id", "universityId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_opportunityId_companyId_fkey" FOREIGN KEY ("opportunityId", "companyId") REFERENCES "Opportunity"("id", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_applicationId_studentId_opportunityId_fkey" FOREIGN KEY ("applicationId", "studentId", "opportunityId") REFERENCES "Application"("id", "studentId", "opportunityId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_studentInternshipId_studentId_fkey" FOREIGN KEY ("studentInternshipId", "studentId") REFERENCES "StudentInternship"("id", "studentId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_universitySupervisorId_universityId_fkey" FOREIGN KEY ("universitySupervisorId", "universityId") REFERENCES "SchoolUser"("id", "universityId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_companySupervisorId_companyId_fkey" FOREIGN KEY ("companySupervisorId", "companyId") REFERENCES "CompanyUser"("id", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
