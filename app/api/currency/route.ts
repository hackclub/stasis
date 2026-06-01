import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * GET /api/currency
 *
 * Returns the authenticated user's bits balance and breakdown.
 *
 *   bitsEarned   = confirmed earnings (PROJECT_APPROVED + ADMIN_GRANT + SHOP_REFUND + REVIEWER_PAYMENT)
 *   bitsSpent    = user-facing outflows (SHOP_PURCHASE + ADMIN_DEDUCTION + SHOP_REFUND_REVERSED)
 *   bitsBalance  = sum of all ledger entries (authoritative)
 *   pendingBits  = net DESIGN_APPROVED entries (pending build review)
 *
 * BOM costs are already deducted before bits are granted, so they don't appear
 * as a separate line item. earned - spent = balance (excluding pending).
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  const EARNED_TYPES = ['PROJECT_APPROVED', 'ADMIN_GRANT', 'SHOP_REFUND', 'REVIEWER_PAYMENT']
  const SPENT_TYPES = ['SHOP_PURCHASE', 'ADMIN_DEDUCTION', 'SHOP_REFUND_REVERSED']

  const [earnedRows, spentRows, balanceResult] = await Promise.all([
    prisma.$queryRaw<{ total: bigint | null }[]>`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM currency_transaction
      WHERE "userId" = ${userId} AND type::text = ANY(${EARNED_TYPES})
    `,
    prisma.$queryRaw<{ total: bigint | null }[]>`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM currency_transaction
      WHERE "userId" = ${userId} AND type::text = ANY(${SPENT_TYPES})
    `,
    prisma.currencyTransaction.aggregate({
      where: { userId },
      _sum: { amount: true },
    }),
  ])

  const pendingRows = await prisma.$queryRaw<{ pending: bigint | null }[]>`
    SELECT COALESCE(SUM(amount), 0) as pending
    FROM currency_transaction
    WHERE "userId" = ${userId} AND type::text = 'DESIGN_APPROVED'
  `
  const pendingBits = Number(pendingRows[0]?.pending ?? 0)

  const bitsEarned = Number(earnedRows[0]?.total ?? 0)
  const bitsSpent = Math.abs(Number(spentRows[0]?.total ?? 0))
  const bitsBalance = balanceResult._sum.amount ?? 0

  return NextResponse.json({ bitsEarned, bitsSpent, bitsBalance, pendingBits })
}
