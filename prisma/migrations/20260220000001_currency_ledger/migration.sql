-- Drop old currency tables from previous system (idempotent)
DROP TABLE IF EXISTS "currency_transaction" CASCADE;
DROP TABLE IF EXISTS "user_currency_balance" CASCADE;
DROP TYPE IF EXISTS "CurrencyTransactionType";

-- Create ledger transaction type enum
CREATE TYPE "CurrencyTransactionType" AS ENUM ('PROJECT_APPROVED', 'ADMIN_GRANT', 'ADMIN_DEDUCTION');

-- Create immutable bits ledger table
CREATE TABLE "currency_transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "amount" INTEGER NOT NULL,
    "type" "CurrencyTransactionType" NOT NULL,
    "note" TEXT,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "currency_transaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "currency_transaction_userId_idx" ON "currency_transaction"("userId");
CREATE INDEX "currency_transaction_createdAt_idx" ON "currency_transaction"("createdAt");

ALTER TABLE "currency_transaction" ADD CONSTRAINT "currency_transaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
