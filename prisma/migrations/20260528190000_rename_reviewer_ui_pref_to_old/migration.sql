/*
  Warnings:

  - You are about to drop the column `reviewerUiV2` on the `user` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "user" DROP COLUMN "reviewerUiV2",
ADD COLUMN     "reviewerUiOld" BOOLEAN NOT NULL DEFAULT false;
