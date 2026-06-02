-- AlterTable
ALTER TABLE "project_submission" ADD COLUMN     "cadFiles" JSONB,
ADD COLUMN     "cadFilesAt" TIMESTAMP(3);
