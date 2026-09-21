-- CreateEnum
CREATE TYPE "CompanyUserRole" AS ENUM ('COMPANY_ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "CompanyUserStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "CompanyUser" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "CompanyUserRole" NOT NULL,
    "status" "CompanyUserStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyUser_accountId_key" ON "CompanyUser"("accountId");

-- CreateIndex
CREATE INDEX "CompanyUser_companyId_idx" ON "CompanyUser"("companyId");

-- CreateIndex
CREATE INDEX "CompanyUser_companyId_role_idx" ON "CompanyUser"("companyId", "role");

-- CreateIndex
CREATE INDEX "CompanyUser_status_idx" ON "CompanyUser"("status");

-- AddForeignKey
ALTER TABLE "CompanyUser" ADD CONSTRAINT "CompanyUser_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyUser" ADD CONSTRAINT "CompanyUser_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
