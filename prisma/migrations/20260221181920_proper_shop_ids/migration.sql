-- AlterTable
ALTER TABLE "currency_transaction" ADD COLUMN     "shopItemId" TEXT;

-- CreateIndex
CREATE INDEX "currency_transaction_userId_shopItemId_idx" ON "currency_transaction"("userId", "shopItemId");
