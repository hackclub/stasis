-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_PAY_REVIEWER';

-- AlterEnum
ALTER TYPE "CurrencyTransactionType" ADD VALUE 'REVIEWER_PAYMENT';

-- AlterTable
ALTER TABLE "submission_review" ADD COLUMN     "paidAt" TIMESTAMP(3);
