import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireInventoryAccess } from "@/lib/inventory/access"
import { REJECTED_JOB_STATUSES } from "@/lib/inventory/manufacturing"
import { pushSSE } from "@/lib/inventory/sse"
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
    return NextResponse.json({ error: "You must be on a team to dismiss a print" }, { status: 403 })
  }

  const resultUpdate = await prisma.manufacturingJob.updateMany({
    where: {
      id,
      teamId: user.teamId,
      status: { in: REJECTED_JOB_STATUSES },
      dismissedAt: null,
    },
    data: { dismissedAt: new Date() },
  })
  if (resultUpdate.count === 0) {
    return NextResponse.json({ error: "Already updated" }, { status: 409 })
  }

  const job = await prisma.manufacturingJob.findUniqueOrThrow({
    where: { id },
    select: { id: true, teamId: true, status: true, dismissedAt: true },
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
      dismissedAt: job.dismissedAt?.toISOString() ?? null,
    },
  }).catch(() => {})
  pushSSE(job.teamId, { type: "manufacturing_job_updated", data: job })

  return NextResponse.json(job)
}
