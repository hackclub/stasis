import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { calculateMultiplier } from "@/lib/xp"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let userXP = await prisma.userXP.findUnique({
    where: { userId: session.user.id },
  })

  if (!userXP) {
    userXP = await prisma.userXP.create({
      data: { userId: session.user.id },
    })
  }

  const recentTransactions = await prisma.xPTransaction.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  })

  const multiplier = calculateMultiplier(
    userXP.currentDayStreak,
    userXP.currentWeekStreak
  )

  return NextResponse.json({
    totalXP: userXP.totalXP,
    dayStreak: userXP.currentDayStreak,
    weekStreak: userXP.currentWeekStreak,
    multiplier,
    recentTransactions,
  })
}
