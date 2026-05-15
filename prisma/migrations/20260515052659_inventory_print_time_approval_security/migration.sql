-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'INVENTORY_LOOKUP';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ManufacturingJobStatus" ADD VALUE 'TIME_APPROVAL_REQUESTED';
ALTER TYPE "ManufacturingJobStatus" ADD VALUE 'TIME_REJECTED_BY_TEAM';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'INVENTORY_STAFF';

-- DropForeignKey
ALTER TABLE "manufacturing_job" DROP CONSTRAINT "manufacturing_job_submittedById_fkey";

-- DropForeignKey
ALTER TABLE "manufacturing_job" DROP CONSTRAINT "manufacturing_job_teamId_fkey";

-- AlterTable
ALTER TABLE "inventory_settings" ADD COLUMN     "maxTeamSize" INTEGER NOT NULL DEFAULT 4;

-- AlterTable
ALTER TABLE "manufacturing_job" ADD COLUMN     "overBudgetApprovedAt" TIMESTAMP(3),
ADD COLUMN     "timeApprovedAt" TIMESTAMP(3),
ADD COLUMN     "timeEstimateRequestedAt" TIMESTAMP(3),
ADD COLUMN     "timeRejectedAt" TIMESTAMP(3),
ALTER COLUMN "estimatedMinutes" DROP NOT NULL;

-- AlterTable
ALTER TABLE "team" ADD COLUMN     "manufacturingAutoApprovePrints" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxMembersOverride" INTEGER;

-- CreateIndex
CREATE INDEX "tool_rental_teamId_status_idx" ON "tool_rental"("teamId", "status");

-- AddForeignKey
ALTER TABLE "manufacturing_job" ADD CONSTRAINT "manufacturing_job_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manufacturing_job" ADD CONSTRAINT "manufacturing_job_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
