import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { SHOP_ITEMS } from "@/lib/shop"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const { id } = await params

  const transactions = await prisma.currencyTransaction.findMany({
    where: {
      userId: id,
      type: "SHOP_PURCHASE",
      shopItemId: { not: null },
    },
    select: {
      id: true,
      shopItemId: true,
      amount: true,
      note: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  })

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

  return NextResponse.json({ purchases })
}
