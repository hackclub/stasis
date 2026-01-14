-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'in_review', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ProjectTag" AS ENUM ('PCB', 'ROBOT', 'CAD', 'ARDUINO', 'RASPBERRY_PI');

-- CreateEnum
CREATE TYPE "SessionCategory" AS ENUM ('FIRMWARE', 'DESIGN_PLANNING', 'PHYSICAL_BUILDING', 'SCHEMATIC', 'PCB_DESIGN', 'CADING');

-- CreateEnum
CREATE TYPE "BadgeType" AS ENUM ('I2C', 'SPI', 'WIFI', 'BLUETOOTH', 'OTHER_RF', 'ANALOG_SENSORS', 'DIGITAL_SENSORS', 'CAD', 'DISPLAYS', 'MOTORS', 'CAMERAS', 'METAL_MACHINING', 'WOOD_FASTENERS', 'MACHINE_LEARNING', 'MCU_INTEGRATION', 'FOUR_LAYER_PCB', 'SOLDERING');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "slackId" TEXT,
    "verificationStatus" TEXT,
    "hackatimeUserId" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tags" "ProjectTag"[],
    "isStarter" BOOLEAN NOT NULL DEFAULT false,
    "starterProjectId" TEXT,
    "githubRepo" TEXT,
    "coverImage" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "submissionNotes" TEXT,
    "reviewComments" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_session" (
    "id" TEXT NOT NULL,
    "hoursClaimed" DOUBLE PRECISION NOT NULL,
    "hoursApproved" DOUBLE PRECISION,
    "content" TEXT,
    "categories" "SessionCategory"[],
    "reviewComments" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "work_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_media" (
    "id" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workSessionId" TEXT NOT NULL,

    CONSTRAINT "session_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_badge" (
    "id" TEXT NOT NULL,
    "badge" "BadgeType" NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedAt" TIMESTAMP(3),
    "grantedBy" TEXT,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "project_badge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_slackId_key" ON "user"("slackId");

-- CreateIndex
CREATE UNIQUE INDEX "user_hackatimeUserId_key" ON "user"("hackatimeUserId");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "project_userId_idx" ON "project"("userId");

-- CreateIndex
CREATE INDEX "work_session_projectId_idx" ON "work_session"("projectId");

-- CreateIndex
CREATE INDEX "session_media_workSessionId_idx" ON "session_media"("workSessionId");

-- CreateIndex
CREATE INDEX "project_badge_projectId_idx" ON "project_badge"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_badge_projectId_badge_key" ON "project_badge"("projectId", "badge");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_session" ADD CONSTRAINT "work_session_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_media" ADD CONSTRAINT "session_media_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "work_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_badge" ADD CONSTRAINT "project_badge_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
