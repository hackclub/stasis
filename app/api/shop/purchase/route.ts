import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { SHOP_ITEMS, SHOP_ITEM_IDS } from "@/lib/shop"
import { Prisma } from "@/app/generated/prisma/client"

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { itemId } = body as { itemId: string }

  const item = SHOP_ITEMS.find((i) => i.id === itemId)
  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 })
  }

  const userId = session.user.id

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Flight stipend requires owning the event invite first
      if (itemId === SHOP_ITEM_IDS.FLIGHT_STIPEND) {
        const hasInvite = await tx.currencyTransaction.count({
          where: {
            userId,
            type: "SHOP_PURCHASE",
            shopItemId: SHOP_ITEM_IDS.STASIS_EVENT_INVITE,
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

      if (balance < item.bitsCost) {
        throw new Error("INSUFFICIENT_BITS")
      }

      // Create the purchase transaction
      const transaction = await tx.currencyTransaction.create({
        data: {
          userId,
          amount: -item.bitsCost,
          type: "SHOP_PURCHASE",
          shopItemId: itemId,
          note: `Purchased: ${item.name}`,
          balanceBefore: balance,
          balanceAfter: balance - item.bitsCost,
        },
      })

      return { id: transaction.id, item: item.name, bitsSpent: item.bitsCost, newBalance: balance - item.bitsCost }
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
    }
    throw error
  }
}
