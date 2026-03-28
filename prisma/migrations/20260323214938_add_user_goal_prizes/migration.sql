-- CreateTable
CREATE TABLE "user_goal_prize" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_goal_prize_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_goal_prize_userId_idx" ON "user_goal_prize"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_goal_prize_userId_shopItemId_key" ON "user_goal_prize"("userId", "shopItemId");

-- AddForeignKey
ALTER TABLE "user_goal_prize" ADD CONSTRAINT "user_goal_prize_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
