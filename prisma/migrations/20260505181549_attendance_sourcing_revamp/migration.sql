/*
  Warnings:

  - You are about to drop the column `snoozedUntil` on the `attendance_candidate` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "AttendanceCandidateSource" AS ENUM ('STASIS_USER', 'REVIEWER_INCENTIVE', 'EXTERNAL_HC', 'DISCRETION');

-- AlterEnum
ALTER TYPE "AttendanceStatus" ADD VALUE 'SHELVED';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ATTENDANCE_ADMIN';

-- DropIndex
DROP INDEX "attendance_candidate_snoozedUntil_idx";

-- AlterTable
ALTER TABLE "attendance_candidate" DROP COLUMN "snoozedUntil",
ADD COLUMN     "caseForThem" TEXT,
ADD COLUMN     "flightCostEstimateCents" INTEGER,
ADD COLUMN     "flightCostUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "flightStipendCents" INTEGER,
ADD COLUMN     "homeAirport" TEXT,
ADD COLUMN     "homeCity" TEXT,
ADD COLUMN     "invitedAt" TIMESTAMP(3),
ADD COLUMN     "isGirl" BOOLEAN,
ADD COLUMN     "source" "AttendanceCandidateSource" NOT NULL DEFAULT 'DISCRETION';

-- CreateIndex
CREATE INDEX "attendance_candidate_source_idx" ON "attendance_candidate"("source");

-- CreateIndex
CREATE INDEX "attendance_candidate_isGirl_idx" ON "attendance_candidate"("isGirl");
