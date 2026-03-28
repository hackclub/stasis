/*
  Warnings:

  - A unique constraint covering the columns `[nfcId]` on the table `user` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "user" ADD COLUMN     "nfcId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "user_nfcId_key" ON "user"("nfcId");
