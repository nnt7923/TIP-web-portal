-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'REVIEWING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Application_universityId_idx" ON "Application"("universityId");

-- CreateIndex
CREATE INDEX "Application_studentId_idx" ON "Application"("studentId");

-- CreateIndex
CREATE INDEX "Application_opportunityId_idx" ON "Application"("opportunityId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Application_studentId_opportunityId_key" ON "Application"("studentId", "opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_id_universityId_key" ON "Student"("id", "universityId");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_studentId_universityId_fkey" FOREIGN KEY ("studentId", "universityId") REFERENCES "Student"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
