-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SIDEKICK';

-- CreateTable
CREATE TABLE "sidekick_assignment" (
    "id" TEXT NOT NULL,
    "sidekickId" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sidekick_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sidekick_assignment_assigneeId_key" ON "sidekick_assignment"("assigneeId");

-- CreateIndex
CREATE INDEX "sidekick_assignment_sidekickId_idx" ON "sidekick_assignment"("sidekickId");

-- AddForeignKey
ALTER TABLE "sidekick_assignment" ADD CONSTRAINT "sidekick_assignment_sidekickId_fkey" FOREIGN KEY ("sidekickId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sidekick_assignment" ADD CONSTRAINT "sidekick_assignment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
