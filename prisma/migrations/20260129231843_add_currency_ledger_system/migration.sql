-- CreateEnum
CREATE TYPE "CurrencyTransactionType" AS ENUM ('BUILD_HOURS_CONVERSION', 'SHOP_PURCHASE', 'ADMIN_ADJUSTMENT', 'REFUND');

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

-- AddForeignKey
ALTER TABLE "user_currency_balance" ADD CONSTRAINT "user_currency_balance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "currency_transaction" ADD CONSTRAINT "currency_transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
