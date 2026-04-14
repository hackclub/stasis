-- CreateEnum
CREATE TYPE "SpotCheckVerdict" AS ENUM ('GOOD', 'BAD');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'SPOT_CHECK_VERDICT';
ALTER TYPE "AuditAction" ADD VALUE 'SPOT_CHECK_VERDICT_CLEARED';
ALTER TYPE "AuditAction" ADD VALUE 'SPOT_CHECK_TRUST_REVIEWER';
ALTER TYPE "AuditAction" ADD VALUE 'SPOT_CHECK_UNTRUST_REVIEWER';

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "airtableRecordId" TEXT;

-- CreateTable
CREATE TABLE "justification_spot_check" (
    "id" TEXT NOT NULL,
    "projectReviewActionId" TEXT NOT NULL,
    "verdict" "SpotCheckVerdict" NOT NULL,
    "checkedById" TEXT NOT NULL,
    "notes" TEXT,
    "badReasonTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "justification_spot_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trusted_reviewer" (
    "id" TEXT NOT NULL,
    "trustedById" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trusted_reviewer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "justification_spot_check_projectReviewActionId_key" ON "justification_spot_check"("projectReviewActionId");

-- CreateIndex
CREATE INDEX "justification_spot_check_verdict_idx" ON "justification_spot_check"("verdict");

-- CreateIndex
CREATE INDEX "justification_spot_check_checkedById_idx" ON "justification_spot_check"("checkedById");

-- CreateIndex
CREATE INDEX "trusted_reviewer_trustedById_idx" ON "trusted_reviewer"("trustedById");

-- CreateIndex
CREATE UNIQUE INDEX "trusted_reviewer_trustedById_reviewerId_key" ON "trusted_reviewer"("trustedById", "reviewerId");

-- CreateIndex
CREATE INDEX "project_review_action_reviewerId_idx" ON "project_review_action"("reviewerId");

-- CreateIndex
CREATE INDEX "project_review_action_createdAt_idx" ON "project_review_action"("createdAt");

-- AddForeignKey
ALTER TABLE "justification_spot_check" ADD CONSTRAINT "justification_spot_check_projectReviewActionId_fkey" FOREIGN KEY ("projectReviewActionId") REFERENCES "project_review_action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "justification_spot_check" ADD CONSTRAINT "justification_spot_check_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trusted_reviewer" ADD CONSTRAINT "trusted_reviewer_trustedById_fkey" FOREIGN KEY ("trustedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trusted_reviewer" ADD CONSTRAINT "trusted_reviewer_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
