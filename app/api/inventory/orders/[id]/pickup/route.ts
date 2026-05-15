import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { pushSSE } from "@/lib/inventory/sse"
import { notifyOrderUpdate } from "@/lib/inventory/notifications"
import { requireInventoryAccess } from "@/lib/inventory/access"
import { logAudit, AuditAction } from "@/lib/audit"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error
  const { session } = result
  const { id } = await params

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teamId: true },
  })
  if (!user?.teamId) {
    return NextResponse.json({ error: "You must be on a team to pick up an order" }, { status: 403 })
  }

  const resultUpdate = await prisma.order.updateMany({
    where: { id, teamId: user.teamId, status: "READY" },
    data: { status: "COMPLETED" },
  })
  if (resultUpdate.count === 0) {
    return NextResponse.json({ error: "Already updated" }, { status: 409 })
  }

  const order = await prisma.order.findUniqueOrThrow({
    where: { id },
    include: {
      team: { select: { id: true, name: true } },
      placedBy: { select: { id: true, name: true, email: true } },
      items: { include: { item: true } },
    },
  })

  logAudit({
    action: AuditAction.INVENTORY_ORDER_STATUS_UPDATE,
    actorId: session.user.id,
    actorEmail: session.user.email,
    targetType: "Order",
    targetId: order.id,
    metadata: { orderId: order.id, status: "COMPLETED", pickedUpByUser: true },
  }).catch(() => {})

  notifyOrderUpdate(order.teamId, order, "Picked Up")
  pushSSE(order.teamId, { type: "order_status_updated", data: order })

  return NextResponse.json(order)
}
