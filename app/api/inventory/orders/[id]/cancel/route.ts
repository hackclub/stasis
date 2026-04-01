import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { pushSSE } from "@/lib/inventory/sse"
import { notifyOrderUpdate } from "@/lib/inventory/notifications"
import { logAudit, AuditAction } from "@/lib/audit"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      team: { select: { id: true } },
      items: { include: { item: { select: { name: true } } } },
    },
  })

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 })
  }

  // Verify user is on the same team
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teamId: true },
  })

  if (!user?.teamId || user.teamId !== order.teamId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Can only cancel if not yet READY or COMPLETED
  if (order.status === "READY" || order.status === "COMPLETED" || order.status === "CANCELLED") {
    return NextResponse.json(
      { error: "Cannot cancel an order that is already ready, completed, or cancelled" },
      { status: 400 }
    )
  }

  // Cancel and restore stock (re-check status inside transaction to prevent race)
  const cancelled = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { id }, select: { status: true } })
    if (!current || current.status === "READY" || current.status === "COMPLETED" || current.status === "CANCELLED") {
      return false
    }

    await tx.order.update({
      where: { id },
      data: { status: "CANCELLED" },
    })

    for (const item of order.items) {
      await tx.item.update({
        where: { id: item.itemId },
        data: { stock: { increment: item.quantity } },
      })
    }
    return true
  })

  if (!cancelled) {
    return NextResponse.json(
      { error: "Cannot cancel an order that is already ready, completed, or cancelled" },
      { status: 400 }
    )
  }

  logAudit({
    action: AuditAction.INVENTORY_ORDER_CANCEL_USER,
    actorId: session.user.id,
    actorEmail: session.user.email,
    targetType: "Order",
    targetId: id,
    metadata: { teamId: order.teamId },
  }).catch(() => {})

  notifyOrderUpdate(order.teamId, order, "Cancelled")
  pushSSE(order.teamId, { type: "order_status_updated", data: { id, status: "CANCELLED" } })

  return NextResponse.json({ success: true })
}
