-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_IMPERSONATE';

-- CreateTable
CREATE TABLE "blueprint_import" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "blueprintProjectId" INTEGER NOT NULL,
    "blueprintTitle" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stasisProjectId" TEXT,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blueprint_import_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blueprint_import_userId_status_idx" ON "blueprint_import"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "blueprint_import_userId_blueprintProjectId_key" ON "blueprint_import"("userId", "blueprintProjectId");

-- AddForeignKey
ALTER TABLE "blueprint_import" ADD CONSTRAINT "blueprint_import_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
