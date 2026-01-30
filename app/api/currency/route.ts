import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import {
  CURRENCY_NAME,
  CURRENCY_PER_HOUR,
  BUILD_HOURS_THRESHOLD,
  getTotalApprovedBuildHours,
} from "@/lib/currency"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  const balanceRecord = await prisma.userCurrencyBalance.findUnique({
    where: { userId },
  })

  const recentTransactions = await prisma.currencyTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  })

  const totalApprovedBuildHours = await getTotalApprovedBuildHours(userId)

  return NextResponse.json({
    currencyName: CURRENCY_NAME,
    balance: balanceRecord?.balance ?? 0,
    totalEarned: balanceRecord?.totalEarned ?? 0,
    totalSpent: balanceRecord?.totalSpent ?? 0,
    totalBuildHoursEarned: balanceRecord?.totalBuildHoursEarned ?? 0,
    totalApprovedBuildHours,
    buildHoursThreshold: BUILD_HOURS_THRESHOLD,
    currencyPerHour: CURRENCY_PER_HOUR,
    recentTransactions: recentTransactions.map((t) => ({
      id: t.id,
      amount: t.amount,
      type: t.type,
      description: t.description,
      createdAt: t.createdAt.toISOString(),
    })),
  })
}
