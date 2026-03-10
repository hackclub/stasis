-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_REVIEW_HACKATIME';

-- CreateTable
CREATE TABLE "hackatime_project" (
    "id" TEXT NOT NULL,
    "hackatimeProject" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "hoursApproved" DOUBLE PRECISION,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hackatime_project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hackatime_project_projectId_idx" ON "hackatime_project"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "hackatime_project_projectId_hackatimeProject_key" ON "hackatime_project"("projectId", "hackatimeProject");

-- AddForeignKey
ALTER TABLE "hackatime_project" ADD CONSTRAINT "hackatime_project_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
