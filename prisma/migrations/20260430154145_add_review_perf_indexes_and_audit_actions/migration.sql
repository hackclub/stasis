-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'AIRTABLE_SYNC_SUCCESS';
ALTER TYPE "AuditAction" ADD VALUE 'AIRTABLE_SYNC_FAILURE';
ALTER TYPE "AuditAction" ADD VALUE 'NOTIFICATION_FAILURE';

-- CreateIndex
CREATE INDEX "project_submission_projectId_stage_createdAt_idx" ON "project_submission"("projectId", "stage", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "review_claim_expiresAt_idx" ON "review_claim"("expiresAt");
