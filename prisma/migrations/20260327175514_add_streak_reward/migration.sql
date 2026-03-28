-- CreateTable
CREATE TABLE "streak_reward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "shipped" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "streak_reward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "streak_reward_userId_key" ON "streak_reward"("userId");

-- AddForeignKey
ALTER TABLE "streak_reward" ADD CONSTRAINT "streak_reward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
