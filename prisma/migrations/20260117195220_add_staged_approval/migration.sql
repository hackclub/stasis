/*
  Warnings:

  - You are about to drop the column `reviewComments` on the `project` table. All the data in the column will be lost.
  - You are about to drop the column `reviewedAt` on the `project` table. All the data in the column will be lost.
  - You are about to drop the column `reviewedBy` on the `project` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `project` table. All the data in the column will be lost.
  - You are about to drop the column `submissionNotes` on the `project` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ProjectStage" AS ENUM ('DESIGN', 'BUILD');

-- AlterTable
ALTER TABLE "project" DROP COLUMN "reviewComments",
DROP COLUMN "reviewedAt",
DROP COLUMN "reviewedBy",
DROP COLUMN "status",
DROP COLUMN "submissionNotes",
ADD COLUMN     "buildReviewComments" TEXT,
ADD COLUMN     "buildReviewedAt" TIMESTAMP(3),
ADD COLUMN     "buildReviewedBy" TEXT,
ADD COLUMN     "buildStatus" "ProjectStatus" NOT NULL DEFAULT 'draft',
ADD COLUMN     "buildSubmissionNotes" TEXT,
ADD COLUMN     "designReviewComments" TEXT,
ADD COLUMN     "designReviewedAt" TIMESTAMP(3),
ADD COLUMN     "designReviewedBy" TEXT,
ADD COLUMN     "designStatus" "ProjectStatus" NOT NULL DEFAULT 'draft',
ADD COLUMN     "designSubmissionNotes" TEXT;

-- AlterTable
ALTER TABLE "work_session" ADD COLUMN     "stage" "ProjectStage" NOT NULL DEFAULT 'BUILD';
