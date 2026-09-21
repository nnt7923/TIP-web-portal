-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('PENDING', 'VERIFIED', 'SUSPENDED', 'INACTIVE');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "address" TEXT,
    "industry" TEXT,
    "logoUrl" TEXT,
    "status" "CompanyStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);
