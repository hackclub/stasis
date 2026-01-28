/*
  Warnings:

  - The values [ADMIN_GRANT_ADMIN,ADMIN_REVOKE_ADMIN] on the enum `AuditAction` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `isAdmin` on the `user` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AuditAction_new" AS ENUM ('ADMIN_GRANT_ROLE', 'ADMIN_REVOKE_ROLE', 'ADMIN_FLAG_FRAUD', 'ADMIN_UNFLAG_FRAUD', 'ADMIN_APPROVE_DESIGN', 'ADMIN_REJECT_DESIGN', 'ADMIN_APPROVE_BUILD', 'ADMIN_REJECT_BUILD', 'ADMIN_REQUEST_UPDATE', 'ADMIN_REVIEW_SESSION', 'ADMIN_APPROVE_BOM', 'ADMIN_REJECT_BOM', 'SUPERADMIN_GRANT', 'USER_DELETE_PROJECT', 'USER_SUBMIT_PROJECT');
ALTER TABLE "audit_log" ALTER COLUMN "action" TYPE "AuditAction_new" USING ("action"::text::"AuditAction_new");
ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
ALTER TYPE "AuditAction_new" RENAME TO "AuditAction";
DROP TYPE "public"."AuditAction_old";
COMMIT;

-- AlterTable
ALTER TABLE "user" DROP COLUMN "isAdmin";
