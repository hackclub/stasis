import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { SHOP_ITEMS } from "@/lib/shop"

/**
 * GET /api/admin/purchases
 *
 * Returns all shop purchases with optional filtering.
 * Query params:
 *   - user: filter by email (contains @) or user CUID
 *   - itemId: filter by shop item ID
 */
export async function GET(request: NextRequest) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY)
  if (authCheck.error) return authCheck.error

  const { searchParams } = request.nextUrl
  const userFilter = searchParams.get("user")?.trim() || null
  const itemIdFilter = searchParams.get("itemId")?.trim() || null
  const statusFilter = searchParams.get("status")?.trim() || null

  // Build where clause
  const where: Record<string, unknown> = {
    type: "SHOP_PURCHASE",
    shopItemId: { not: null },
  }

  if (userFilter) {
    if (userFilter.includes("@")) {
      where.user = { email: { contains: userFilter, mode: "insensitive" } }
    } else {
      where.userId = userFilter
    }
  }

  if (itemIdFilter) {
    where.shopItemId = itemIdFilter
  }

  if (statusFilter === "fulfilled") {
    where.fulfilledAt = { not: null }
  } else if (statusFilter === "unfulfilled") {
    where.fulfilledAt = null
  }

  const transactions = await prisma.currencyTransaction.findMany({
    where,
    select: {
      id: true,
      shopItemId: true,
      amount: true,
      note: true,
      createdAt: true,
      fulfilledAt: true,
      user: {
        select: { id: true, email: true, name: true, image: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  })

  // Resolve item names from DB shop items
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
      user: t.user,
      itemId: t.shopItemId!,
      itemName:
        shopItem?.name ??
        dbItem?.name ??
        t.note?.replace("Purchased: ", "") ??
        "Unknown",
      itemImageUrl: dbItem?.imageUrl ?? null,
      amount: Math.abs(t.amount),
      createdAt: t.createdAt.toISOString(),
      fulfilledAt: t.fulfilledAt?.toISOString() ?? null,
    }
  })

  // Build a list of all known items for the filter dropdown
  const allItems = [
    ...SHOP_ITEMS.map((si) => ({ id: si.id, name: si.name })),
    ...dbItems.map((i) => ({ id: i.id, name: i.name })),
  ]
  // Deduplicate
  const itemOptions = Array.from(
    new Map(allItems.map((i) => [i.id, i])).values()
  )

  return NextResponse.json({ purchases, itemOptions })
}
