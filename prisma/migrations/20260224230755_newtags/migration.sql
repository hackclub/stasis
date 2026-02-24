-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProjectTag" ADD VALUE 'THREE_D_PRINT';
ALTER TYPE "ProjectTag" ADD VALUE 'LASER_CUT';
ALTER TYPE "ProjectTag" ADD VALUE 'IOT';
ALTER TYPE "ProjectTag" ADD VALUE 'WEARABLE';
ALTER TYPE "ProjectTag" ADD VALUE 'AUDIO';
ALTER TYPE "ProjectTag" ADD VALUE 'LED';
ALTER TYPE "ProjectTag" ADD VALUE 'DRONE';
ALTER TYPE "ProjectTag" ADD VALUE 'SENSOR';
ALTER TYPE "ProjectTag" ADD VALUE 'WIRELESS';
ALTER TYPE "ProjectTag" ADD VALUE 'MOTOR';
ALTER TYPE "ProjectTag" ADD VALUE 'DISPLAY';
ALTER TYPE "ProjectTag" ADD VALUE 'BATTERY';
ALTER TYPE "ProjectTag" ADD VALUE 'SOLAR';
ALTER TYPE "ProjectTag" ADD VALUE 'KEYBOARD';
ALTER TYPE "ProjectTag" ADD VALUE 'GAME_CONSOLE';
ALTER TYPE "ProjectTag" ADD VALUE 'HOME_AUTOMATION';
ALTER TYPE "ProjectTag" ADD VALUE 'WEATHER_STATION';
ALTER TYPE "ProjectTag" ADD VALUE 'CNC';
