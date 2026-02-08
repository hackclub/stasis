import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { getCurrentWeekBounds } from "@/lib/xp"
import { Prisma } from "@/app/generated/prisma/client"

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
  })

  if (!prize) {
    return NextResponse.json(
      { error: "Prize not found or not available this week" },
      { status: 404 }
    )
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingClaim = await tx.prizeClaim.findUnique({
        where: {
          userId_prizeId: {
            userId: session.user.id,
            prizeId,
          },
        },
      })

      if (existingClaim) {
        throw new Error("ALREADY_CLAIMED")
      }

      if (prize.maxQuantity) {
        const claimCount = await tx.prizeClaim.count({
          where: { prizeId },
        })
        if (claimCount >= prize.maxQuantity) {
          throw new Error("OUT_OF_STOCK")
        }
      }

      const userXP = await tx.userXP.findUnique({
        where: { userId: session.user.id },
      })

      if (!userXP || userXP.totalXP < prize.xpCost) {
        throw new Error("NOT_ENOUGH_XP")
      }

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

      return { id: claim.id, prizeId: claim.prizeId, xpSpent: claim.xpSpent }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "ALREADY_CLAIMED") {
        return NextResponse.json({ error: "You have already claimed this prize" }, { status: 400 })
      }
      if (error.message === "OUT_OF_STOCK") {
        return NextResponse.json({ error: "Prize is out of stock" }, { status: 400 })
      }
      if (error.message === "NOT_ENOUGH_XP") {
        return NextResponse.json({ error: "Not enough XP to claim this prize" }, { status: 400 })
      }
    }
    throw error
  }
}
