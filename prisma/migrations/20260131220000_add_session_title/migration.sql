-- AlterTable
ALTER TABLE "work_session" ADD COLUMN "title" TEXT NOT NULL DEFAULT 'Untitled Session';

-- Remove the default after adding the column (new rows must have explicit title)
ALTER TABLE "work_session" ALTER COLUMN "title" DROP DEFAULT;
