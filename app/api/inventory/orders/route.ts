import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { Prisma } from "@/app/generated/prisma/client"
import { pushSSE } from "@/lib/inventory/sse"
import { notifyOrderUpdate } from "@/lib/inventory/notifications"
import { requireInventoryAccess } from "@/lib/inventory/access"
import { logAudit, AuditAction } from "@/lib/audit"
import {
  sanitizeLocation,
  validateFloor,
  validatePositiveInt,
} from "@/lib/inventory/validation"

export async function GET() {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error
  const { session } = result

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
      placedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(orders)
}

export async function POST(request: Request) {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error
  const { session } = result

  const body = await request.json()
  const { items, floor, location } = body as {
    items: Array<{ itemId: string; quantity: number }>
    floor: number
    location: string
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Items are required" }, { status: 400 })
  }

  if (!validateFloor(floor)) {
    return NextResponse.json(
      { error: "Invalid floor number" },
      { status: 400 }
    )
  }

  if (!location || typeof location !== "string") {
    return NextResponse.json(
      { error: "Location is required" },
      { status: 400 }
    )
  }

  const safeLocation = sanitizeLocation(location)
  if (safeLocation.length === 0) {
    return NextResponse.json(
      { error: "Location is required" },
      { status: 400 }
    )
  }

  for (const { quantity } of items) {
    if (!validatePositiveInt(quantity)) {
      return NextResponse.json(
        { error: "Each item quantity must be a positive integer" },
        { status: 400 }
      )
    }
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

      // Merge duplicate itemIds by summing quantities
      const mergedItems = new Map<string, number>()
      for (const { itemId, quantity } of items) {
        mergedItems.set(itemId, (mergedItems.get(itemId) ?? 0) + quantity)
      }

      for (const [itemId, quantity] of mergedItems) {
        const item = await tx.item.findUnique({ where: { id: itemId } })
        if (!item) {
          throw new Error("Item not found")
        }
        if (item.stock < quantity) {
          throw new Error(`Insufficient stock for ${item.name}`)
        }

        const usageResult = await tx.orderItem.aggregate({
          _sum: { quantity: true },
          where: {
            itemId,
            order: { teamId: user.teamId, status: { not: "CANCELLED" } },
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
          location: safeLocation,
          items: {
            create: Array.from(mergedItems, ([itemId, quantity]) => ({
              itemId,
              quantity,
            })),
          },
        },
        include: {
          items: { include: { item: true } },
          placedBy: { select: { id: true, name: true } },
        },
      })
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to place order"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  logAudit({
    action: AuditAction.INVENTORY_ORDER_PLACE,
    actorId: session.user.id,
    actorEmail: session.user.email,
    targetType: "Order",
    targetId: order.id,
    metadata: { teamId: order.teamId, items: items.map(i => ({ itemId: i.itemId, quantity: i.quantity })), floor, location: safeLocation },
  }).catch(() => {})

  notifyOrderUpdate(order.teamId, order, "Placed")
  pushSSE(order.teamId, { type: "order_placed", data: order })

  return NextResponse.json(order, { status: 201 })
}
