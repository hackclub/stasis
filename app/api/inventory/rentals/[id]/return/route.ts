import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { pushSSE } from "@/lib/inventory/sse"
import { notifyRental } from "@/lib/inventory/notifications"
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
    return NextResponse.json({ error: "You must be on a team to return a tool" }, { status: 403 })
  }

  const resultUpdate = await prisma.toolRental.updateMany({
    where: { id, teamId: user.teamId, status: "CHECKED_OUT" },
    data: {
      status: "RETURN_REQUESTED",
      returnRequestedAt: new Date(),
    },
  })
  if (resultUpdate.count === 0) {
    return NextResponse.json({ error: "Already updated" }, { status: 409 })
  }

  const rental = await prisma.toolRental.findUniqueOrThrow({
    where: { id },
    include: {
      tool: true,
      team: { select: { id: true, name: true } },
      rentedBy: { select: { id: true, name: true, email: true } },
    },
  })

  logAudit({
    action: AuditAction.INVENTORY_RENTAL_RETURN,
    actorId: session.user.id,
    actorEmail: session.user.email,
    targetType: "ToolRental",
    targetId: rental.id,
    metadata: { rentalId: rental.id, toolId: rental.toolId, status: "RETURN_REQUESTED" },
  }).catch(() => {})

  notifyRental(rental.teamId, rental.tool.name, "Tool Return Requested")
  pushSSE(rental.teamId, { type: "rental_status_updated", data: rental })

  return NextResponse.json(rental)
}
