/*
  Warnings:

  - You are about to drop the column `caseForThem` on the `attendance_candidate` table. All the data in the column will be lost.
  - You are about to drop the column `flakeNote` on the `attendance_candidate` table. All the data in the column will be lost.
  - You are about to drop the column `statusNote` on the `attendance_candidate` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "attendance_candidate" DROP COLUMN "caseForThem",
DROP COLUMN "flakeNote",
DROP COLUMN "statusNote",
ADD COLUMN     "attendStatus" TEXT,
ADD COLUMN     "homeCountry" TEXT,
ADD COLUMN     "homeState" TEXT,
ADD COLUMN     "homeStreet" TEXT,
ADD COLUMN     "homeZip" TEXT;
