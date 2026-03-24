import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"
import { pushSSE } from "@/lib/inventory/sse"
import { notifyTeam } from "@/lib/inventory/notifications"

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminResult = await requireAdmin()
  if ("error" in adminResult) return adminResult.error
  const { session } = adminResult

  const { id } = await params

  const rental = await prisma.toolRental.findUnique({
    where: { id },
    include: { tool: true },
  })

  if (!rental) {
    return NextResponse.json({ error: "Rental not found" }, { status: 404 })
  }

  if (rental.status === "RETURNED") {
    return NextResponse.json(
      { error: "Rental has already been returned" },
      { status: 400 }
    )
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.toolRental.update({
      where: { id },
      data: {
        status: "RETURNED",
        returnedAt: new Date(),
      },
      include: {
        tool: true,
        team: { select: { id: true, name: true } },
        rentedBy: { select: { id: true, name: true, email: true } },
      },
    })

    await tx.tool.update({
      where: { id: rental.toolId },
      data: { available: true },
    })

    return result
  })

  notifyTeam(
    updated.teamId,
    `Tool ${updated.tool.name} has been returned`
  )

  await logAdminAction(
    AuditAction.INVENTORY_RENTAL_RETURN,
    session.user.id,
    session.user.email,
    "ToolRental",
    id,
    { rentalId: id, toolId: rental.toolId }
  )

  pushSSE(updated.teamId, { type: "rental_returned", data: updated })

  return NextResponse.json(updated)
}
