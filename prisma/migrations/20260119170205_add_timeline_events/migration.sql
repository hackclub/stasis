-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVED', 'CHANGE_REQUESTED', 'REJECTED');

-- CreateTable
CREATE TABLE "project_submission" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stage" "ProjectStage" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_review_action" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stage" "ProjectStage" NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "comments" TEXT,
    "grantAmount" DOUBLE PRECISION,
    "reviewerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_review_action_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_submission_projectId_idx" ON "project_submission"("projectId");

-- CreateIndex
CREATE INDEX "project_review_action_projectId_idx" ON "project_review_action"("projectId");

-- AddForeignKey
ALTER TABLE "project_submission" ADD CONSTRAINT "project_submission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_review_action" ADD CONSTRAINT "project_review_action_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
