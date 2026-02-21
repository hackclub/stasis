import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * GET /api/currency
 *
 * Returns the authenticated user's bits balance from the immutable ledger,
 * plus BOM costs for display purposes.
 *
 *   bitsEarned  = sum of positive ledger entries (PROJECT_APPROVED + ADMIN_GRANT)
 *   bitsDeducted = absolute sum of negative ledger entries (ADMIN_DEDUCTION)
 *   bitsBalance = sum of all ledger entries (authoritative)
 *   bomCost     = sum of approved BOM item costs (informational; shown separately)
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  const [earned, deducted, bomResult] = await Promise.all([
    prisma.currencyTransaction.aggregate({
      where: { userId, amount: { gt: 0 } },
      _sum: { amount: true },
    }),
    prisma.currencyTransaction.aggregate({
      where: { userId, amount: { lt: 0 } },
      _sum: { amount: true },
    }),
    prisma.bOMItem.findMany({
      where: {
        status: "approved",
        project: { userId },
      },
      select: { costPerItem: true, quantity: true },
    }),
  ])

  const bitsEarned = earned._sum.amount ?? 0
  const bitsDeducted = Math.abs(deducted._sum.amount ?? 0)
  const bitsBalance = bitsEarned - bitsDeducted
  const bomCost = bomResult.reduce((acc, item) => acc + item.costPerItem * item.quantity, 0)

  return NextResponse.json({ bitsEarned, bitsDeducted, bitsBalance, bomCost })
}
