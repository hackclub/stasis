-- CreateEnum
CREATE TYPE "BOMItemStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "bom_item" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT,
    "costPerItem" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL,
    "link" TEXT,
    "distributor" TEXT,
    "status" "BOMItemStatus" NOT NULL DEFAULT 'pending',
    "reviewComments" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "bom_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bom_item_projectId_idx" ON "bom_item"("projectId");

-- AddForeignKey
ALTER TABLE "bom_item" ADD CONSTRAINT "bom_item_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
