-- AlterTable
ALTER TABLE "project" ADD COLUMN     "deletedById" TEXT;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
