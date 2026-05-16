-- CreateEnum
CREATE TYPE "ManufacturingPrinterStatus" AS ENUM ('AVAILABLE', 'PRINTING', 'PAUSED', 'MAINTENANCE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "ManufacturingJobStatus" AS ENUM ('PENDING', 'APPROVED', 'QUEUED', 'PRINTING', 'PAUSED', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "team" ADD COLUMN     "manufacturingAllowanceMinutes" INTEGER NOT NULL DEFAULT 240;

-- CreateTable
CREATE TABLE "manufacturing_printer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ManufacturingPrinterStatus" NOT NULL DEFAULT 'AVAILABLE',
    "currentJobId" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "timeRemainingMinutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "lastCompletedJobId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manufacturing_printer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturing_job" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "material" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "fileLink" TEXT,
    "notes" TEXT,
    "status" "ManufacturingJobStatus" NOT NULL DEFAULT 'PENDING',
    "assignedPrinterId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3),
    "staffNotes" TEXT,
    "priority" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manufacturing_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturing_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "defaultAllowanceMinutes" INTEGER NOT NULL DEFAULT 240,
    "warningLongPrintMinutes" INTEGER NOT NULL DEFAULT 240,
    "eventName" TEXT NOT NULL DEFAULT 'Stasis',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manufacturing_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "manufacturing_printer_name_key" ON "manufacturing_printer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturing_printer_currentJobId_key" ON "manufacturing_printer"("currentJobId");

-- CreateIndex
CREATE INDEX "manufacturing_printer_status_idx" ON "manufacturing_printer"("status");

-- CreateIndex
CREATE INDEX "manufacturing_job_teamId_status_idx" ON "manufacturing_job"("teamId", "status");

-- CreateIndex
CREATE INDEX "manufacturing_job_submittedById_idx" ON "manufacturing_job"("submittedById");

-- CreateIndex
CREATE INDEX "manufacturing_job_assignedPrinterId_idx" ON "manufacturing_job"("assignedPrinterId");

-- CreateIndex
CREATE INDEX "manufacturing_job_status_priority_submittedAt_idx" ON "manufacturing_job"("status", "priority", "submittedAt");

-- AddForeignKey
ALTER TABLE "manufacturing_job" ADD CONSTRAINT "manufacturing_job_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manufacturing_job" ADD CONSTRAINT "manufacturing_job_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manufacturing_job" ADD CONSTRAINT "manufacturing_job_assignedPrinterId_fkey" FOREIGN KEY ("assignedPrinterId") REFERENCES "manufacturing_printer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
