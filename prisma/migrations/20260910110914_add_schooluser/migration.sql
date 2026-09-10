-- CreateEnum
CREATE TYPE "SchoolUserRole" AS ENUM ('STAFF', 'UNIVERSITY_SUPERVISOR');

-- CreateEnum
CREATE TYPE "SchoolUserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "SchoolUser" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "SchoolUserRole" NOT NULL,
    "status" "SchoolUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolUser_universityId_idx" ON "SchoolUser"("universityId");

-- CreateIndex
CREATE INDEX "SchoolUser_universityId_role_idx" ON "SchoolUser"("universityId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolUser_universityId_email_key" ON "SchoolUser"("universityId", "email");

-- AddForeignKey
ALTER TABLE "SchoolUser" ADD CONSTRAINT "SchoolUser_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
