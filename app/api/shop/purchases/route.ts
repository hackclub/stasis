import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { SHOP_ITEMS } from "@/lib/shop"

/**
 * GET /api/shop/purchases
 *
 * Returns the list of shop item IDs the user has purchased,
 * aggregated totals for repeatable items (flight stipend),
 * and a detailed purchase list with item names and dates.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [transactions, userRow] = await Promise.all([
    prisma.currencyTransaction.findMany({
      where: {
        userId: session.user.id,
        type: "SHOP_PURCHASE",
        shopItemId: { not: null },
      },
      select: { id: true, shopItemId: true, amount: true, note: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { attendRegisteredAt: true },
    }),
  ])

  const isStasisAttendee = !!userRow?.attendRegisteredAt

  const purchasedItemIds: string[] = []
  const itemTotals: Record<string, number> = {}

  for (const t of transactions) {
    const id = t.shopItemId!

    if (!purchasedItemIds.includes(id)) {
      purchasedItemIds.push(id)
    }
    itemTotals[id] = (itemTotals[id] ?? 0) + Math.abs(t.amount)
  }

  // Collect unique DB item IDs (not hardcoded shop items)
  const dbItemIds = [
    ...new Set(
      transactions
        .map((t) => t.shopItemId!)
        .filter((id) => !SHOP_ITEMS.some((si) => si.id === id))
    ),
  ]

  const dbItems =
    dbItemIds.length > 0
      ? await prisma.shopItem.findMany({
          where: { id: { in: dbItemIds } },
          select: { id: true, name: true, imageUrl: true },
        })
      : []

  const dbItemMap = new Map(dbItems.map((i) => [i.id, i]))

  const purchases = transactions.map((t) => {
    const shopItem = SHOP_ITEMS.find((si) => si.id === t.shopItemId)
    const dbItem = dbItemMap.get(t.shopItemId!)
    return {
      id: t.id,
      itemId: t.shopItemId!,
      itemName:
        shopItem?.name ??
        dbItem?.name ??
        t.note?.replace("Purchased: ", "") ??
        "Unknown",
      imageUrl: dbItem?.imageUrl ?? null,
      amount: Math.abs(t.amount),
      purchasedAt: t.createdAt.toISOString(),
    }
  })

  return NextResponse.json({ purchasedItemIds, itemTotals, purchases, isStasisAttendee })
}
