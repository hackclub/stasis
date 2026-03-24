import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"
import { pushSSE } from "@/lib/inventory/sse"
import { notifyTeam } from "@/lib/inventory/notifications"
import { OrderStatus } from "@/app/generated/prisma/client"

const VALID_STATUSES: OrderStatus[] = ["IN_PROGRESS", "READY", "COMPLETED"]

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
    notifyTeam(order.teamId, "Your order is ready for pickup!")
  } else if (status === "COMPLETED") {
    notifyTeam(order.teamId, "Your order has been completed!")
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
