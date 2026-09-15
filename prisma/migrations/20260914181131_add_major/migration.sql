-- CreateTable
CREATE TABLE "Major" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Major_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Major_universityId_idx" ON "Major"("universityId");

-- CreateIndex
CREATE UNIQUE INDEX "Major_universityId_name_key" ON "Major"("universityId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Major_universityId_code_key" ON "Major"("universityId", "code");

-- AddForeignKey
ALTER TABLE "Major" ADD CONSTRAINT "Major_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
