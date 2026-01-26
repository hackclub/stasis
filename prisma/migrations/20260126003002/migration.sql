-- CreateEnum
CREATE TYPE "XPTransactionType" AS ENUM ('JOURNAL_ENTRY', 'STREAK_BONUS', 'EVENT_BONUS', 'PRIZE_PURCHASE');

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

-- AddForeignKey
ALTER TABLE "user_xp" ADD CONSTRAINT "user_xp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_transaction" ADD CONSTRAINT "xp_transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prize_claim" ADD CONSTRAINT "prize_claim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prize_claim" ADD CONSTRAINT "prize_claim_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "weekly_prize"("id") ON DELETE CASCADE ON UPDATE CASCADE;
