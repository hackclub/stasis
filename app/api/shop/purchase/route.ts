import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { SHOP_ITEMS, SHOP_ITEM_IDS, EVENT_INVITE_IDS } from "@/lib/shop"
import { Prisma } from "@/app/generated/prisma/client"

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { itemId, quantity: rawQuantity } = body as { itemId: string; quantity?: number }

  const quantity = Math.max(1, Math.floor(rawQuantity ?? 1))

  let item: { id: string; name: string; bitsCost: number; maxPerUser: number; category?: string } | undefined =
    SHOP_ITEMS.find((i) => i.id === itemId)

  if (!item) {
    // Fall back to database shop items
    const dbItem = await prisma.shopItem.findFirst({
      where: { id: itemId, active: true },
      select: { id: true, name: true, price: true, maxPerUser: true },
    })
    if (!dbItem) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }
    item = { id: dbItem.id, name: dbItem.name, bitsCost: dbItem.price, maxPerUser: dbItem.maxPerUser }
  }

  const totalCost = item.bitsCost * quantity

  const userId = session.user.id

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Flight stipend requires owning any event invite first
      if (itemId === SHOP_ITEM_IDS.FLIGHT_STIPEND) {
        const hasInvite = await tx.currencyTransaction.count({
          where: {
            userId,
            type: "SHOP_PURCHASE",
            shopItemId: { in: EVENT_INVITE_IDS as unknown as string[] },
          },
        })
        if (hasInvite === 0) {
          throw new Error("REQUIRES_EVENT_INVITE")
        }
      }

      // Check if user already owns max quantity (0 = unlimited)
      if (item.maxPerUser > 0) {
        const existingPurchases = await tx.currencyTransaction.count({
          where: {
            userId,
            type: "SHOP_PURCHASE",
            shopItemId: itemId,
          },
        })

        if (existingPurchases >= item.maxPerUser) {
          throw new Error("ALREADY_PURCHASED")
        }

        if (existingPurchases + quantity > item.maxPerUser) {
          throw new Error("EXCEEDS_MAX")
        }
      }

      // Calculate current balance from ledger
      const [earned, deducted] = await Promise.all([
        tx.currencyTransaction.aggregate({
          where: { userId, amount: { gt: 0 } },
          _sum: { amount: true },
        }),
        tx.currencyTransaction.aggregate({
          where: { userId, amount: { lt: 0 } },
          _sum: { amount: true },
        }),
      ])

      const balance = (earned._sum.amount ?? 0) + (deducted._sum.amount ?? 0)
      // Use raw SQL with text cast to avoid enum validation error if migration hasn't run
      const pendingRows = await tx.$queryRaw<{ pending: bigint | null }[]>`
        SELECT COALESCE(SUM(amount), 0) as pending
        FROM currency_transaction
        WHERE "userId" = ${userId} AND type::text = 'DESIGN_APPROVED'
      `
      const pendingBits = Number(pendingRows[0]?.pending ?? 0)

      // Only the Stasis Event Invite can be purchased with pending bits;
      // all other items require confirmed (build-approved) bits only
      const effectiveBalance = itemId === SHOP_ITEM_IDS.STASIS_EVENT_INVITE
        ? balance
        : balance - pendingBits

      if (effectiveBalance < totalCost) {
        throw new Error("INSUFFICIENT_BITS")
      }

      // Create purchase transactions (one per unit for ledger consistency)
      let currentBalance = balance
      let lastTransactionId = ''
      for (let i = 0; i < quantity; i++) {
        const transaction = await tx.currencyTransaction.create({
          data: {
            userId,
            amount: -item.bitsCost,
            type: "SHOP_PURCHASE",
            shopItemId: itemId,
            note: `Purchased: ${item.name}`,
            balanceBefore: currentBalance,
            balanceAfter: currentBalance - item.bitsCost,
          },
        })
        lastTransactionId = transaction.id
        currentBalance -= item.bitsCost
      }

      // Auto-remove purchased item from goal prizes
      await tx.userGoalPrize.deleteMany({
        where: { userId, shopItemId: itemId },
      })

      return { id: lastTransactionId, item: item.name, bitsSpent: totalCost, newBalance: currentBalance }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "REQUIRES_EVENT_INVITE") {
        return NextResponse.json({ error: "You must purchase an Event Invite before buying Flight Stipends" }, { status: 400 })
      }
      if (error.message === "ALREADY_PURCHASED") {
        return NextResponse.json({ error: "You already own this item" }, { status: 400 })
      }
      if (error.message === "INSUFFICIENT_BITS") {
        return NextResponse.json({ error: "Not enough bits" }, { status: 400 })
      }
      if (error.message === "EXCEEDS_MAX") {
        return NextResponse.json({ error: "Quantity exceeds maximum allowed" }, { status: 400 })
      }
    }
    console.error("Shop purchase error:", error)
    return NextResponse.json({ error: "Purchase failed" }, { status: 500 })
  }
}
