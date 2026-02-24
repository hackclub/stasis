/*
  Warnings:

  - You are about to drop the `prize_claim` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_xp` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `weekly_prize` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `xp_transaction` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "prize_claim" DROP CONSTRAINT "prize_claim_prizeId_fkey";

-- DropForeignKey
ALTER TABLE "prize_claim" DROP CONSTRAINT "prize_claim_userId_fkey";

-- DropForeignKey
ALTER TABLE "user_xp" DROP CONSTRAINT "user_xp_userId_fkey";

-- DropForeignKey
ALTER TABLE "xp_transaction" DROP CONSTRAINT "xp_transaction_userId_fkey";

-- DropTable
DROP TABLE "prize_claim";

-- DropTable
DROP TABLE "user_xp";

-- DropTable
DROP TABLE "weekly_prize";

-- DropTable
DROP TABLE "xp_transaction";

-- DropEnum
DROP TYPE "XPTransactionType";
