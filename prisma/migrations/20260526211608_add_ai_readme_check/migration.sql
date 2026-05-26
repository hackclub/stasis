-- AlterTable
ALTER TABLE "project_submission" ADD COLUMN     "aiReadmeStatus" TEXT,
ADD COLUMN     "aiReadmeVerdict" JSONB,
ADD COLUMN     "aiReadmeVerdictAt" TIMESTAMP(3);
