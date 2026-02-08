-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'in_review', 'approved', 'rejected', 'update_requested');

-- CreateEnum
CREATE TYPE "ProjectStage" AS ENUM ('DESIGN', 'BUILD');

-- CreateEnum
CREATE TYPE "XPTransactionType" AS ENUM ('JOURNAL_ENTRY', 'STREAK_BONUS', 'EVENT_BONUS', 'PRIZE_PURCHASE');

-- CreateEnum
CREATE TYPE "CurrencyTransactionType" AS ENUM ('BUILD_HOURS_CONVERSION', 'SHOP_PURCHASE', 'ADMIN_ADJUSTMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVED', 'CHANGE_REQUESTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProjectTag" AS ENUM ('PCB', 'ROBOT', 'CAD', 'ARDUINO', 'RASPBERRY_PI');

-- CreateEnum
CREATE TYPE "SessionCategory" AS ENUM ('FIRMWARE', 'DESIGN_PLANNING', 'PHYSICAL_BUILDING', 'SCHEMATIC', 'PCB_DESIGN', 'CADING');

-- CreateEnum
CREATE TYPE "BadgeType" AS ENUM ('I2C', 'SPI', 'WIFI', 'BLUETOOTH', 'OTHER_RF', 'ANALOG_SENSORS', 'DIGITAL_SENSORS', 'CAD', 'DISPLAYS', 'MOTORS', 'CAMERAS', 'METAL_MACHINING', 'WOOD_FASTENERS', 'MACHINE_LEARNING', 'MCU_INTEGRATION', 'FOUR_LAYER_PCB', 'SOLDERING');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "BOMItemStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'REVIEWER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('ADMIN_GRANT_ROLE', 'ADMIN_REVOKE_ROLE', 'ADMIN_FLAG_FRAUD', 'ADMIN_UNFLAG_FRAUD', 'ADMIN_APPROVE_DESIGN', 'ADMIN_REJECT_DESIGN', 'ADMIN_APPROVE_BUILD', 'ADMIN_REJECT_BUILD', 'ADMIN_REQUEST_UPDATE', 'ADMIN_REVIEW_SESSION', 'ADMIN_APPROVE_BOM', 'ADMIN_REJECT_BOM', 'SUPERADMIN_GRANT', 'USER_DELETE_PROJECT', 'USER_SUBMIT_PROJECT');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "slackId" TEXT,
    "verificationStatus" TEXT,
    "hackatimeUserId" TEXT,
    "bio" TEXT,
    "fraudConvicted" BOOLEAN NOT NULL DEFAULT false,
    "tutorialDashboard" BOOLEAN NOT NULL DEFAULT false,
    "tutorialProject" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tags" "ProjectTag"[],
    "isStarter" BOOLEAN NOT NULL DEFAULT false,
    "starterProjectId" TEXT,
    "githubRepo" TEXT,
    "coverImage" TEXT,
    "noBomNeeded" BOOLEAN NOT NULL DEFAULT false,
    "designStatus" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "designSubmissionNotes" TEXT,
    "designReviewComments" TEXT,
    "designReviewedAt" TIMESTAMP(3),
    "designReviewedBy" TEXT,
    "buildStatus" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "buildSubmissionNotes" TEXT,
    "buildReviewComments" TEXT,
    "buildReviewedAt" TIMESTAMP(3),
    "buildReviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_submission" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stage" "ProjectStage" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_review_action" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stage" "ProjectStage" NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "comments" TEXT,
    "grantAmount" DOUBLE PRECISION,
    "reviewerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_review_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_session" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hoursClaimed" DOUBLE PRECISION NOT NULL,
    "hoursApproved" DOUBLE PRECISION,
    "content" TEXT,
    "categories" "SessionCategory"[],
    "stage" "ProjectStage" NOT NULL DEFAULT 'BUILD',
    "reviewComments" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "work_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_media" (
    "id" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workSessionId" TEXT NOT NULL,

    CONSTRAINT "session_media_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "project_badge" (
    "id" TEXT NOT NULL,
    "badge" "BadgeType" NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedAt" TIMESTAMP(3),
    "grantedBy" TEXT,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "project_badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorIp" TEXT,
    "actorUserAgent" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_xp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalXP" INTEGER NOT NULL DEFAULT 0,
    "currentDayStreak" INTEGER NOT NULL DEFAULT 0,
    "currentWeekStreak" INTEGER NOT NULL DEFAULT 0,
    "lastJournalDate" TIMESTAMP(3),
    "lastJournalWeek" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_xp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xp_transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "XPTransactionType" NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "description" TEXT,
    "workSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_prize" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "xpCost" INTEGER NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "imageUrl" TEXT,
    "maxQuantity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_prize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prize_claim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "xpSpent" INTEGER NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prize_claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_currency_balance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "totalEarned" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" INTEGER NOT NULL DEFAULT 0,
    "totalBuildHoursEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_currency_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency_transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "CurrencyTransactionType" NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "description" TEXT,
    "workSessionId" TEXT,
    "projectId" TEXT,
    "shopItemId" TEXT,
    "hoursConverted" DOUBLE PRECISION,
    "adjustedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "currency_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kudos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kudos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_slackId_key" ON "user"("slackId");

-- CreateIndex
CREATE UNIQUE INDEX "user_hackatimeUserId_key" ON "user"("hackatimeUserId");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "project_userId_idx" ON "project"("userId");

-- CreateIndex
CREATE INDEX "project_submission_projectId_idx" ON "project_submission"("projectId");

-- CreateIndex
CREATE INDEX "project_review_action_projectId_idx" ON "project_review_action"("projectId");

-- CreateIndex
CREATE INDEX "work_session_projectId_idx" ON "work_session"("projectId");

-- CreateIndex
CREATE INDEX "session_media_workSessionId_idx" ON "session_media"("workSessionId");

-- CreateIndex
CREATE INDEX "bom_item_projectId_idx" ON "bom_item"("projectId");

-- CreateIndex
CREATE INDEX "project_badge_projectId_idx" ON "project_badge"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_badge_projectId_badge_key" ON "project_badge"("projectId", "badge");

-- CreateIndex
CREATE INDEX "user_role_userId_idx" ON "user_role"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_userId_role_key" ON "user_role"("userId", "role");

-- CreateIndex
CREATE INDEX "audit_log_actorId_idx" ON "audit_log"("actorId");

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- CreateIndex
CREATE INDEX "audit_log_targetId_idx" ON "audit_log"("targetId");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_xp_userId_key" ON "user_xp"("userId");

-- CreateIndex
CREATE INDEX "user_xp_userId_idx" ON "user_xp"("userId");

-- CreateIndex
CREATE INDEX "xp_transaction_userId_idx" ON "xp_transaction"("userId");

-- CreateIndex
CREATE INDEX "xp_transaction_type_idx" ON "xp_transaction"("type");

-- CreateIndex
CREATE INDEX "weekly_prize_weekStart_weekEnd_idx" ON "weekly_prize"("weekStart", "weekEnd");

-- CreateIndex
CREATE INDEX "prize_claim_userId_idx" ON "prize_claim"("userId");

-- CreateIndex
CREATE INDEX "prize_claim_prizeId_idx" ON "prize_claim"("prizeId");

-- CreateIndex
CREATE UNIQUE INDEX "prize_claim_userId_prizeId_key" ON "prize_claim"("userId", "prizeId");

-- CreateIndex
CREATE UNIQUE INDEX "user_currency_balance_userId_key" ON "user_currency_balance"("userId");

-- CreateIndex
CREATE INDEX "user_currency_balance_userId_idx" ON "user_currency_balance"("userId");

-- CreateIndex
CREATE INDEX "currency_transaction_userId_idx" ON "currency_transaction"("userId");

-- CreateIndex
CREATE INDEX "currency_transaction_type_idx" ON "currency_transaction"("type");

-- CreateIndex
CREATE INDEX "currency_transaction_workSessionId_idx" ON "currency_transaction"("workSessionId");

-- CreateIndex
CREATE INDEX "currency_transaction_projectId_idx" ON "currency_transaction"("projectId");

-- CreateIndex
CREATE INDEX "currency_transaction_createdAt_idx" ON "currency_transaction"("createdAt");

-- CreateIndex
CREATE INDEX "kudos_userId_idx" ON "kudos"("userId");

-- CreateIndex
CREATE INDEX "kudos_projectId_idx" ON "kudos"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "kudos_userId_projectId_key" ON "kudos"("userId", "projectId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_submission" ADD CONSTRAINT "project_submission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_review_action" ADD CONSTRAINT "project_review_action_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_session" ADD CONSTRAINT "work_session_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_media" ADD CONSTRAINT "session_media_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "work_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_item" ADD CONSTRAINT "bom_item_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_badge" ADD CONSTRAINT "project_badge_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_xp" ADD CONSTRAINT "user_xp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_transaction" ADD CONSTRAINT "xp_transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prize_claim" ADD CONSTRAINT "prize_claim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prize_claim" ADD CONSTRAINT "prize_claim_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "weekly_prize"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_currency_balance" ADD CONSTRAINT "user_currency_balance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "currency_transaction" ADD CONSTRAINT "currency_transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kudos" ADD CONSTRAINT "kudos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kudos" ADD CONSTRAINT "kudos_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
