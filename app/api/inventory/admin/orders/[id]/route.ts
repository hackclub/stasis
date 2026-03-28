import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"
import { pushSSE } from "@/lib/inventory/sse"
import { notifyOrderUpdate } from "@/lib/inventory/notifications"
import { OrderStatus } from "@/app/generated/prisma/client"

const VALID_STATUSES: OrderStatus[] = ["IN_PROGRESS", "READY", "COMPLETED", "CANCELLED"]

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminResult = await requireAdmin()
  if ("error" in adminResult) return adminResult.error
  const { session } = adminResult

  const { id } = await params
  const body = await request.json()
  const { status } = body as { status: OrderStatus }

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    )
  }

  // If cancelling, restore stock
  if (status === "CANCELLED") {
    const existing = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    })
    if (!existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }
    if (existing.status === "READY" || existing.status === "COMPLETED" || existing.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Cannot cancel an order that is already ready, completed, or cancelled" },
        { status: 400 }
      )
    }

    const order = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: { status },
        include: {
          team: { select: { id: true, name: true } },
          placedBy: { select: { id: true, name: true, email: true } },
          items: { include: { item: true } },
        },
      })
      for (const item of existing.items) {
        await tx.item.update({
          where: { id: item.itemId },
          data: { stock: { increment: item.quantity } },
        })
      }
      return updated
    })

    notifyOrderUpdate(order.teamId, order, "Cancelled")

    await logAdminAction(
      AuditAction.INVENTORY_ORDER_CANCEL,
      session.user.id,
      session.user.email,
      "Order",
      id,
      { orderId: id, status }
    )

    pushSSE(order.teamId, { type: "order_status_updated", data: order })
    return NextResponse.json(order)
  }

  const order = await prisma.order.update({
    where: { id },
    data: { status },
    include: {
      team: { select: { id: true, name: true } },
      placedBy: { select: { id: true, name: true, email: true } },
      items: { include: { item: true } },
    },
  })

  if (status === "READY") {
    notifyOrderUpdate(order.teamId, order, "Ready for Pickup")
  } else if (status === "IN_PROGRESS") {
    notifyOrderUpdate(order.teamId, order, "In Progress")
  }

  await logAdminAction(
    AuditAction.INVENTORY_ORDER_STATUS_UPDATE,
    session.user.id,
    session.user.email,
    "Order",
    id,
    { orderId: id, status }
  )

  pushSSE(order.teamId, { type: "order_status_updated", data: order })

  return NextResponse.json(order)
}
