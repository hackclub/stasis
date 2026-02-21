import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { SHOP_ITEMS } from "@/lib/shop"

/**
 * GET /api/shop/purchases
 *
 * Returns the list of shop item IDs the user has purchased,
 * plus aggregated totals for repeatable items (flight stipend).
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const transactions = await prisma.currencyTransaction.findMany({
    where: {
      userId: session.user.id,
      type: "SHOP_PURCHASE",
      shopItemId: { not: null },
    },
    select: { shopItemId: true, amount: true },
  })

  const purchasedItemIds: string[] = []
  const itemTotals: Record<string, number> = {}

  for (const t of transactions) {
    const id = t.shopItemId!
    if (!SHOP_ITEMS.some((item) => item.id === id)) continue

    if (!purchasedItemIds.includes(id)) {
      purchasedItemIds.push(id)
    }
    itemTotals[id] = (itemTotals[id] ?? 0) + Math.abs(t.amount)
  }

  return NextResponse.json({ purchasedItemIds, itemTotals })
}
