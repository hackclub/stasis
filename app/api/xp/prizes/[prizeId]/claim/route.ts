import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { getCurrentWeekBounds } from "@/lib/xp"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ prizeId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { prizeId } = await params

  const { weekStart, weekEnd } = getCurrentWeekBounds()

  const prize = await prisma.weeklyPrize.findFirst({
    where: {
      id: prizeId,
      weekStart: { lte: weekEnd },
      weekEnd: { gte: weekStart },
    },
    include: { claims: true },
  })

  if (!prize) {
    return NextResponse.json(
      { error: "Prize not found or not available this week" },
      { status: 404 }
    )
  }

  const existingClaim = await prisma.prizeClaim.findUnique({
    where: {
      userId_prizeId: {
        userId: session.user.id,
        prizeId,
      },
    },
  })

  if (existingClaim) {
    return NextResponse.json(
      { error: "You have already claimed this prize" },
      { status: 400 }
    )
  }

  if (prize.maxQuantity && prize.claims.length >= prize.maxQuantity) {
    return NextResponse.json(
      { error: "Prize is out of stock" },
      { status: 400 }
    )
  }

  const userXP = await prisma.userXP.findUnique({
    where: { userId: session.user.id },
  })

  if (!userXP || userXP.totalXP < prize.xpCost) {
    return NextResponse.json(
      { error: "Not enough XP to claim this prize" },
      { status: 400 }
    )
  }

  const result = await prisma.$transaction(async (tx) => {
    const claim = await tx.prizeClaim.create({
      data: {
        userId: session.user.id,
        prizeId,
        xpSpent: prize.xpCost,
      },
    })

    await tx.xPTransaction.create({
      data: {
        userId: session.user.id,
        amount: -prize.xpCost,
        type: "PRIZE_PURCHASE",
        description: `Claimed prize: ${prize.name}`,
      },
    })

    await tx.userXP.update({
      where: { userId: session.user.id },
      data: {
        totalXP: { decrement: prize.xpCost },
      },
    })

    return claim
  })

  return NextResponse.json(result)
}
