/*
  Warnings:

  - You are about to drop the column `notifyPrefs` on the `user` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "team" ADD COLUMN     "slackChannelId" TEXT;

-- AlterTable
ALTER TABLE "user" DROP COLUMN "notifyPrefs";
