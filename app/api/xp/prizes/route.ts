import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { getCurrentWeekBounds } from "@/lib/xp"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { weekStart, weekEnd } = getCurrentWeekBounds()

  const userXP = await prisma.userXP.findUnique({
    where: { userId: session.user.id },
  })

  const totalXP = userXP?.totalXP ?? 0

  const prizes = await prisma.weeklyPrize.findMany({
    where: {
      weekStart: { lte: weekEnd },
      weekEnd: { gte: weekStart },
    },
    include: {
      _count: {
        select: { claims: true },
      },
    },
  })

  const userClaims = await prisma.prizeClaim.findMany({
    where: { userId: session.user.id },
    select: { prizeId: true },
  })

  const claimedPrizeIds = new Set(userClaims.map((c) => c.prizeId))

  const prizesWithStatus = prizes.map((prize) => {
    const claimCount = prize._count.claims
    const remainingQuantity = prize.maxQuantity
      ? prize.maxQuantity - claimCount
      : null

    return {
      id: prize.id,
      name: prize.name,
      description: prize.description,
      xpCost: prize.xpCost,
      imageUrl: prize.imageUrl,
      maxQuantity: prize.maxQuantity,
      remainingQuantity,
      canAfford: totalXP >= prize.xpCost,
      alreadyClaimed: claimedPrizeIds.has(prize.id),
    }
  })

  return NextResponse.json(prizesWithStatus)
}
