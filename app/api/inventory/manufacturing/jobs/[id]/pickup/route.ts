import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireInventoryAccess } from "@/lib/inventory/access"
import { pushSSE } from "@/lib/inventory/sse"
import { notifyPrintUpdate } from "@/lib/inventory/notifications"
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
    return NextResponse.json({ error: "You must be on a team to pick up a print" }, { status: 403 })
  }

  const resultUpdate = await prisma.manufacturingJob.updateMany({
    where: { id, teamId: user.teamId, status: "READY" },
    data: { status: "COMPLETED", collectedAt: new Date() },
  })
  if (resultUpdate.count === 0) {
    return NextResponse.json({ error: "Already updated" }, { status: 409 })
  }

  const job = await prisma.manufacturingJob.findUniqueOrThrow({
    where: { id },
  })
  logAudit({
    action: AuditAction.INVENTORY_ORDER_STATUS_UPDATE,
    actorId: session.user.id,
    actorEmail: session.user.email,
    targetType: "ManufacturingJob",
    targetId: id,
    metadata: {
      teamId: job.teamId,
      status: job.status,
      collectedAt: job.collectedAt?.toISOString() ?? null,
    },
  }).catch(() => {})
  pushSSE(job.teamId, { type: "manufacturing_job_updated", data: job })
  notifyPrintUpdate(job.teamId, job, "Print Picked Up")

  return NextResponse.json(job)
}
