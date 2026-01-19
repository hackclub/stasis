-- AlterTable
ALTER TABLE "user" ADD COLUMN     "tutorialDashboard" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tutorialProject" BOOLEAN NOT NULL DEFAULT false;
