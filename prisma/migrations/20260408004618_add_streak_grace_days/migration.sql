-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_GRANT_STREAK_GRACE_DAY';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_REVOKE_STREAK_GRACE_DAY';

-- CreateTable
CREATE TABLE "streak_grace_day" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "streak_grace_day_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "streak_grace_day_userId_idx" ON "streak_grace_day"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "streak_grace_day_userId_date_key" ON "streak_grace_day"("userId", "date");
