/*
  Warnings:

  - Added the required column `username` to the `SchoolUser` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "SchoolUserStatus" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "SchoolUser" ADD COLUMN     "username" TEXT NOT NULL;
