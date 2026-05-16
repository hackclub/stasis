-- AlterEnum
BEGIN;
CREATE TYPE "ManufacturingJobStatus_new" AS ENUM ('PENDING', 'QUEUED', 'PRINTING', 'READY', 'COMPLETED', 'REJECTED', 'REJECTED_BY_ORGANIZER', 'REJECTED_BY_PRINTER', 'CANCELLED');
UPDATE "manufacturing_job" SET "status" = 'QUEUED' WHERE "status" IN ('APPROVED','PAUSED');
ALTER TABLE "public"."manufacturing_job" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "manufacturing_job" ALTER COLUMN "status" TYPE "ManufacturingJobStatus_new" USING ("status"::text::"ManufacturingJobStatus_new");
ALTER TYPE "ManufacturingJobStatus" RENAME TO "ManufacturingJobStatus_old";
ALTER TYPE "ManufacturingJobStatus_new" RENAME TO "ManufacturingJobStatus";
DROP TYPE "public"."ManufacturingJobStatus_old";
ALTER TABLE "manufacturing_job" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RentalStatus" ADD VALUE 'PLACED';
ALTER TYPE "RentalStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "RentalStatus" ADD VALUE 'READY';
ALTER TYPE "RentalStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "manufacturing_printer" DROP COLUMN "progress",
DROP COLUMN "timeRemainingMinutes";
