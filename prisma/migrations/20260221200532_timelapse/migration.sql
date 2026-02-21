-- CreateTable
CREATE TABLE "session_timelapse" (
    "id" TEXT NOT NULL,
    "timelapseId" TEXT NOT NULL,
    "name" TEXT,
    "thumbnailUrl" TEXT,
    "playbackUrl" TEXT,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workSessionId" TEXT NOT NULL,

    CONSTRAINT "session_timelapse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_timelapse_workSessionId_idx" ON "session_timelapse"("workSessionId");

-- AddForeignKey
ALTER TABLE "session_timelapse" ADD CONSTRAINT "session_timelapse_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "work_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
