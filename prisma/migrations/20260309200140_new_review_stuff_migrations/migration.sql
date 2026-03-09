-- CreateEnum
CREATE TYPE "ReviewResult" AS ENUM ('APPROVED', 'RETURNED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'REVIEWER_APPROVE';
ALTER TYPE "AuditAction" ADD VALUE 'REVIEWER_RETURN';
ALTER TYPE "AuditAction" ADD VALUE 'REVIEWER_REJECT';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_MOVE_QUEUE';

-- AlterTable
ALTER TABLE "project_submission" ADD COLUMN     "preReviewed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "submission_review" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "result" "ReviewResult" NOT NULL,
    "isAdminReview" BOOLEAN NOT NULL DEFAULT false,
    "feedback" TEXT NOT NULL,
    "reason" TEXT,
    "invalidated" BOOLEAN NOT NULL DEFAULT false,
    "workUnitsOverride" DOUBLE PRECISION,
    "tierOverride" INTEGER,
    "grantOverride" INTEGER,
    "categoryOverride" TEXT,
    "frozenWorkUnits" DOUBLE PRECISION,
    "frozenEntryCount" INTEGER,
    "frozenFundingAmount" INTEGER,
    "frozenTier" INTEGER,
    "frozenReviewerNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_claim" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviewer_note" (
    "id" TEXT NOT NULL,
    "aboutUserId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviewer_note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "submission_review_submissionId_idx" ON "submission_review"("submissionId");

-- CreateIndex
CREATE INDEX "submission_review_reviewerId_idx" ON "submission_review"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "review_claim_submissionId_key" ON "review_claim"("submissionId");

-- CreateIndex
CREATE INDEX "review_claim_reviewerId_idx" ON "review_claim"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "reviewer_note_aboutUserId_key" ON "reviewer_note"("aboutUserId");

-- AddForeignKey
ALTER TABLE "submission_review" ADD CONSTRAINT "submission_review_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "project_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_claim" ADD CONSTRAINT "review_claim_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "project_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
