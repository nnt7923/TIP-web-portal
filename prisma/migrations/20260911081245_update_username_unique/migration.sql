/*
  Warnings:

  - A unique constraint covering the columns `[username]` on the table `SchoolUser` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "SchoolUser_username_key" ON "SchoolUser"("username");
