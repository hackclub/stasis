-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('ADMIN_LOGIN', 'ADMIN_VIEW_USERS', 'ADMIN_VIEW_USER', 'ADMIN_UPDATE_USER', 'ADMIN_GRANT_ADMIN', 'ADMIN_REVOKE_ADMIN', 'ADMIN_FLAG_FRAUD', 'ADMIN_UNFLAG_FRAUD', 'ADMIN_VIEW_PROJECTS', 'ADMIN_VIEW_PROJECT', 'ADMIN_APPROVE_DESIGN', 'ADMIN_REJECT_DESIGN', 'ADMIN_APPROVE_BUILD', 'ADMIN_REJECT_BUILD', 'ADMIN_REQUEST_UPDATE', 'ADMIN_REVIEW_SESSION', 'ADMIN_APPROVE_BOM', 'ADMIN_REJECT_BOM', 'ADMIN_VIEW_AUDIT_LOGS', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'SUPERADMIN_GRANT', 'USER_DELETE_PROJECT', 'USER_SUBMIT_PROJECT');

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorIp" TEXT,
    "actorUserAgent" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_actorId_idx" ON "audit_log"("actorId");

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- CreateIndex
CREATE INDEX "audit_log_targetId_idx" ON "audit_log"("targetId");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");
