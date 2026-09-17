/*
  Warnings:

  - A unique constraint covering the columns `[universityId,name]` on the table `AcademicYear` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE INDEX "AcademicYear_universityId_idx" ON "AcademicYear"("universityId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_universityId_name_key" ON "AcademicYear"("universityId", "name");
