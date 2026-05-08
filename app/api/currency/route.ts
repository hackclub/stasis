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

  const [earned, deducted, designApprovedProjects] = await Promise.all([
    prisma.currencyTransaction.aggregate({
      where: { userId, amount: { gt: 0 } },
      _sum: { amount: true },
    }),
    prisma.currencyTransaction.aggregate({
      where: { userId, amount: { lt: 0 } },
      _sum: { amount: true },
    }),
    prisma.project.findMany({
      where: { userId, deletedAt: null, designStatus: "approved" },
      select: {
        bomTax: true,
        bomShipping: true,
        bomItems: { where: { status: "approved" }, select: { totalCost: true } },
      },
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
  // Sum each design-approved project's BOM cost (items + tax + shipping) ceil'd to whole bits,
  // matching how bits are deducted at design-approval time. Otherwise the UI shows fractional dollars.
  const bomCost = designApprovedProjects.reduce((acc, p) => {
    const items = p.bomItems.reduce((s, b) => s + b.totalCost, 0)
    const project = items + (p.bomTax ?? 0) + (p.bomShipping ?? 0)
    return acc + Math.ceil(project)
  }, 0)

  return NextResponse.json({ bitsEarned, bitsDeducted, bitsBalance, pendingBits, bomCost })
}
