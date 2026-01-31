-- CreateTable
CREATE TABLE "kudos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kudos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kudos_userId_idx" ON "kudos"("userId");

-- CreateIndex
CREATE INDEX "kudos_projectId_idx" ON "kudos"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "kudos_userId_projectId_key" ON "kudos"("userId", "projectId");

-- AddForeignKey
ALTER TABLE "kudos" ADD CONSTRAINT "kudos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kudos" ADD CONSTRAINT "kudos_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
