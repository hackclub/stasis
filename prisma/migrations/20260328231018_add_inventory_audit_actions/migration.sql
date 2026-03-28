/*
  Warnings:

  - You are about to drop the column `slackPinnedTs` on the `team` table. All the data in the column will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_BADGE_ASSIGN';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_ORDER_PLACE';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_ORDER_CANCEL_USER';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_RENTAL_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_TEAM_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_TEAM_JOIN';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_TEAM_LEAVE';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_TEAM_DELETE';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_TEAM_RENAME';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_TEAM_KICK_MEMBER';
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_TEAM_ADD_MEMBER';

-- AlterTable
ALTER TABLE "team" DROP COLUMN "slackPinnedTs",
ADD COLUMN     "slackWelcomeTs" TEXT;
