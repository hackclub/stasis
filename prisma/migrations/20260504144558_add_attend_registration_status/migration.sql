-- AlterTable
ALTER TABLE "user" ADD COLUMN     "attendLastError" TEXT,
ADD COLUMN     "attendLastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "attendRegisteredAt" TIMESTAMP(3);
