-- AlterTable
ALTER TABLE "user" ADD COLUMN     "stasisAttendInterested" BOOLEAN,
ADD COLUMN     "stasisAttendPlanning" BOOLEAN,
ADD COLUMN     "stasisAttendSurveyAt" TIMESTAMP(3);
