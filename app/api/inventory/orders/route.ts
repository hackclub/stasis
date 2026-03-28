import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { pushSSE } from "@/lib/inventory/sse"
import { notifyOrderUpdate } from "@/lib/inventory/notifications"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teamId: true },
  })

  if (!user?.teamId) {
    return NextResponse.json(
      { error: "You must be on a team to view orders" },
      { status: 403 }
    )
  }

  const orders = await prisma.order.findMany({
    where: { teamId: user.teamId },
    include: {
      items: { include: { item: true } },
      placedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(orders)
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { items, floor, location } = body as {
    items: Array<{ itemId: string; quantity: number }>
    floor: number
    location: string
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Items are required" }, { status: 400 })
  }

  if (typeof floor !== "number" || !location) {
    return NextResponse.json(
      { error: "Floor and location are required" },
      { status: 400 }
    )
  }

  let order
  try {
    order = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: session.user.id },
        include: { team: true },
      })

      if (!user?.teamId || !user.team) {
        throw new Error("You must be on a team to place an order")
      }

      if (user.team.locked) {
        throw new Error("Your team is locked and cannot place orders")
      }

      const allowMultiple = process.env.INVENTORY_ALLOW_MULTIPLE_ORDERS === "true"
      if (!allowMultiple) {
        const activeOrder = await tx.order.findFirst({
          where: {
            teamId: user.teamId,
            status: { notIn: ["COMPLETED", "CANCELLED"] },
          },
        })

        if (activeOrder) {
          throw new Error("Your team already has an active order")
        }
      }

      for (const { itemId, quantity } of items) {
        const item = await tx.item.findUnique({ where: { id: itemId } })
        if (!item) {
          throw new Error(`Item ${itemId} not found`)
        }
        if (item.stock < quantity) {
          throw new Error(`Insufficient stock for ${item.name}`)
        }

        const usageResult = await tx.orderItem.aggregate({
          _sum: { quantity: true },
          where: {
            itemId,
            order: { teamId: user.teamId },
          },
        })
        const totalUsage = usageResult._sum.quantity ?? 0

        if (totalUsage + quantity > item.maxPerTeam) {
          throw new Error(
            `Exceeds max per team for ${item.name} (limit: ${item.maxPerTeam}, used: ${totalUsage})`
          )
        }

        await tx.item.update({
          where: { id: itemId },
          data: { stock: { decrement: quantity } },
        })
      }

      return tx.order.create({
        data: {
          teamId: user.teamId,
          placedById: session.user.id,
          floor,
          location,
          items: {
            create: items.map(({ itemId, quantity }) => ({
              itemId,
              quantity,
            })),
          },
        },
        include: {
          items: { include: { item: true } },
          placedBy: { select: { id: true, name: true, email: true } },
        },
      })
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to place order"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  notifyOrderUpdate(order.teamId, order, "Placed")
  pushSSE(order.teamId, { type: "order_placed", data: order })

  return NextResponse.json(order, { status: 201 })
}
