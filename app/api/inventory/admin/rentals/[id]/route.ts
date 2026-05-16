import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { RentalStatus } from "@/app/generated/prisma/client"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"
import { pushSSE } from "@/lib/inventory/sse"
import { notifyRental } from "@/lib/inventory/notifications"
import { TOOL_RENTAL_TIME_LIMIT_MINUTES } from "@/lib/inventory/config"

const VALID_TRANSITIONS: Record<string, RentalStatus[]> = {
  PLACED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["READY", "CANCELLED"],
  READY: ["CHECKED_OUT", "CANCELLED"],
  CHECKED_OUT: ["RETURN_REQUESTED", "RETURNED"],
  RETURN_REQUESTED: ["RETURNED", "CHECKED_OUT"],
  RETURNED: [],
  CANCELLED: [],
}

function rentalTitle(status: RentalStatus) {
  switch (status) {
    case "IN_PROGRESS":
      return "Tool Request In Progress"
    case "READY":
      return "Tool Ready"
    case "CHECKED_OUT":
      return "Tool Checked Out"
    case "RETURNED":
      return "Tool Returned"
    case "RETURN_REQUESTED":
      return "Tool Return Requested"
    case "CANCELLED":
      return "Tool Request Cancelled"
    default:
      return "Tool Request Updated"
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminResult = await requireAdmin()
  if ("error" in adminResult) return adminResult.error
  const { session } = adminResult

  const { id } = await params
  const body = await request.json()
  const { status } = body as { status: RentalStatus }

  if (!status || !Object.values(RentalStatus).includes(status)) {
    return NextResponse.json({ error: "Invalid rental status" }, { status: 400 })
  }

  const existing = await prisma.toolRental.findUnique({
    where: { id },
    include: { tool: true },
  })
  if (!existing) return NextResponse.json({ error: "Rental not found" }, { status: 404 })

  const allowed = VALID_TRANSITIONS[existing.status] ?? []
  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: `Cannot transition from ${existing.status} to ${status}` },
      { status: 400 }
    )
  }

  const dueAt =
    status === "CHECKED_OUT" && TOOL_RENTAL_TIME_LIMIT_MINUTES > 0
      ? new Date(Date.now() + TOOL_RENTAL_TIME_LIMIT_MINUTES * 60 * 1000)
      : undefined

  const updated = await prisma.$transaction(async (tx) => {
    const rental = await tx.toolRental.update({
      where: { id },
      data: {
        status,
        ...(dueAt !== undefined && { dueAt }),
        ...(status === "RETURN_REQUESTED" && { returnRequestedAt: new Date() }),
        ...(status === "RETURNED" && { returnedAt: new Date() }),
        ...(existing.status === "RETURN_REQUESTED" && status === "CHECKED_OUT" && { returnRequestedAt: null }),
      },
      include: {
        tool: true,
        team: { select: { id: true, name: true } },
        rentedBy: { select: { id: true, name: true, email: true } },
      },
    })

    if (status === "RETURNED" || status === "CANCELLED") {
      await tx.tool.update({
        where: { id: existing.toolId },
        data: { available: true },
      })
    }

    return rental
  })

  notifyRental(updated.teamId, updated.tool.name, rentalTitle(status))

  await logAdminAction(
    status === "RETURNED" ? AuditAction.INVENTORY_RENTAL_RETURN : AuditAction.INVENTORY_ORDER_STATUS_UPDATE,
    session.user.id,
    session.user.email,
    "ToolRental",
    id,
    { rentalId: id, toolId: existing.toolId, status }
  )

  pushSSE(updated.teamId, { type: "rental_status_updated", data: updated })

  return NextResponse.json(updated)
}
