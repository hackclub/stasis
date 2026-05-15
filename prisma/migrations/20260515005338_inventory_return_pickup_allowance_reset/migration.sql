-- AlterEnum
ALTER TYPE "RentalStatus" ADD VALUE 'RETURN_REQUESTED';

-- AlterTable
ALTER TABLE "team" ADD COLUMN     "manufacturingAllowanceResetAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tool_rental" ADD COLUMN     "returnRequestedAt" TIMESTAMP(3);
