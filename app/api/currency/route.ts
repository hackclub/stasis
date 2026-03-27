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

  const [earned, deducted, bomResult, taxShippingResult] = await Promise.all([
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
      select: { totalCost: true },
    }),
    prisma.project.aggregate({
      where: { userId, deletedAt: null },
      _sum: { bomTax: true, bomShipping: true },
    }),
  ])

  // Use raw SQL with text cast to avoid enum validation error if migration hasn't run
  const pendingRows = await prisma.$queryRaw<{ pending: bigint | null }[]>`
    SELECT COALESCE(SUM(amount), 0) as pending
    FROM currency_transaction
    WHERE "userId" = ${userId} AND type::text = 'DESIGN_APPROVED'
  `
  const pendingBits = Number(pendingRows[0]?.pending ?? 0)

  const bitsEarned = earned._sum.amount ?? 0
  const bitsDeducted = Math.abs(deducted._sum.amount ?? 0)
  const bitsBalance = bitsEarned - bitsDeducted
  const bomItemsCost = bomResult.reduce((acc, item) => acc + item.totalCost, 0)
  const bomCost = bomItemsCost + (taxShippingResult._sum.bomTax ?? 0) + (taxShippingResult._sum.bomShipping ?? 0)

  return NextResponse.json({ bitsEarned, bitsDeducted, bitsBalance, pendingBits, bomCost })
}
