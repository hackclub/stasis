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

  // Items paid from the pending pool record the debit on a DESIGN_APPROVED row
  // and leave the paired SHOP_PURCHASE row at amount=0, so totals and per-row
  // costs must fold both in (refunds net out, matching the travel sync).
  const [transactions, userRow] = await Promise.all([
    prisma.currencyTransaction.findMany({
      where: {
        userId: session.user.id,
        shopItemId: { not: null },
        OR: [
          { type: "SHOP_PURCHASE" },
          { type: "SHOP_REFUND" },
          { type: "DESIGN_APPROVED", amount: { lt: 0 } },
        ],
      },
      select: { id: true, type: true, shopItemId: true, amount: true, note: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { attendRegisteredAt: true },
    }),
  ])

  const isStasisAttendee = !!userRow?.attendRegisteredAt

  const purchasedItemIds: string[] = []
  const itemTotals: Record<string, number> = {}
  // Pending-pool debits waiting to be attributed to the SHOP_PURCHASE row
  // created immediately after them in the same transaction.
  const pendingCarry: Record<string, number> = {}
  const purchaseRows: { id: string; shopItemId: string; cost: number; note: string | null; createdAt: Date }[] = []

  for (const t of transactions) {
    const id = t.shopItemId!

    if (t.type === "DESIGN_APPROVED") {
      pendingCarry[id] = (pendingCarry[id] ?? 0) + Math.abs(t.amount)
      itemTotals[id] = (itemTotals[id] ?? 0) + Math.abs(t.amount)
      continue
    }

    if (t.type === "SHOP_REFUND") {
      itemTotals[id] = (itemTotals[id] ?? 0) - t.amount
      continue
    }

    // SHOP_PURCHASE
    if (!purchasedItemIds.includes(id)) {
      purchasedItemIds.push(id)
    }
    itemTotals[id] = (itemTotals[id] ?? 0) + Math.abs(t.amount)
    purchaseRows.push({
      id: t.id,
      shopItemId: id,
      cost: Math.abs(t.amount) + (pendingCarry[id] ?? 0),
      note: t.note,
      createdAt: t.createdAt,
    })
    pendingCarry[id] = 0
  }

  purchaseRows.reverse() // newest first

  // Collect unique DB item IDs (not hardcoded shop items)
  const dbItemIds = [
    ...new Set(
      purchaseRows
        .map((t) => t.shopItemId)
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

  const purchases = purchaseRows.map((t) => {
    const shopItem = SHOP_ITEMS.find((si) => si.id === t.shopItemId)
    const dbItem = dbItemMap.get(t.shopItemId)
    return {
      id: t.id,
      itemId: t.shopItemId,
      itemName:
        shopItem?.name ??
        dbItem?.name ??
        t.note?.replace("Purchased: ", "") ??
        "Unknown",
      imageUrl: dbItem?.imageUrl ?? null,
      amount: t.cost,
      purchasedAt: t.createdAt.toISOString(),
    }
  })

  return NextResponse.json({ purchasedItemIds, itemTotals, purchases, isStasisAttendee })
}
