import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getPendingBits } from "@/lib/currency"

/**
 * GET /api/currency
 *
 * Returns the authenticated user's bits balance and breakdown.
 *
 *   bitsBalance  = sum of all ledger entries (authoritative)
 *   pendingBits  = design-approval bits for projects awaiting build approval
 *   bitsSpent    = user-facing outflows (SHOP_PURCHASE + ADMIN_DEDUCTION + SHOP_REFUND_REVERSED)
 *   bitsEarned   = derived: (balance - pending) + spent, so earned - spent always
 *                  equals the spendable balance. A type-bucketed SUM would drift
 *                  whenever the ledger holds correction entries (e.g. an ADMIN_GRANT
 *                  offsetting an erroneous DESIGN_APPROVED deduction), which reads
 *                  as "missing bits" in the shop header.
 *
 * BOM costs are already deducted before bits are granted, so they don't appear
 * as a separate line item.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  const SPENT_TYPES = ['SHOP_PURCHASE', 'ADMIN_DEDUCTION', 'SHOP_REFUND_REVERSED']

  const [spentRows, balanceResult] = await Promise.all([
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

  const pendingBits = await getPendingBits(prisma, userId)

  const bitsSpent = Math.abs(Number(spentRows[0]?.total ?? 0))
  const bitsBalance = balanceResult._sum.amount ?? 0
  const bitsEarned = Math.max(0, bitsBalance - pendingBits + bitsSpent)

  return NextResponse.json({ bitsEarned, bitsSpent, bitsBalance, pendingBits })
}
