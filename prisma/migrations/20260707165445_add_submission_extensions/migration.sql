-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_GRANT_EXTENSION';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_REVOKE_EXTENSION';

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "submissionExtensionUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "submissionExtensionUntil" TIMESTAMP(3);
