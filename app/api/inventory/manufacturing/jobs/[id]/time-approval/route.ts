import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireInventoryAccess } from "@/lib/inventory/access"
import { pushSSE } from "@/lib/inventory/sse"
import { notifyPrintUpdate } from "@/lib/inventory/notifications"
import { updateManufacturingJob } from "@/lib/inventory/manufacturing"
import { logAudit, AuditAction } from "@/lib/audit"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error
  const { session } = result
  const { id } = await params
  const body = await request.json().catch(() => null)
  const approved = Boolean(body?.approved)

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teamId: true },
  })
  if (!user?.teamId) {
    return NextResponse.json({ error: "You must be on a team to approve print time" }, { status: 403 })
  }

  try {
    const job = approved
      ? await updateManufacturingJob(id, { expectedTeamId: user.teamId, expectedStatus: "TIME_APPROVAL_REQUESTED", status: "QUEUED" })
      : await updateManufacturingJob(id, { expectedTeamId: user.teamId, expectedStatus: "TIME_APPROVAL_REQUESTED", status: "TIME_REJECTED_BY_TEAM" })

    logAudit({
      action: AuditAction.INVENTORY_ORDER_STATUS_UPDATE,
      actorId: session.user.id,
      actorEmail: session.user.email,
      targetType: "ManufacturingJob",
      targetId: id,
      metadata: {
        teamId: job.teamId,
        approved,
        status: job.status,
      },
    }).catch(() => {})
    pushSSE(job.teamId, { type: "manufacturing_job_updated", data: job })
    notifyPrintUpdate(
      job.teamId,
      job,
      approved ? "Print Time Approved" : "Print Time Rejected"
    )
    return NextResponse.json(job)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update print time approval."
    return NextResponse.json(
      { error: message },
      { status: message === "Already updated" ? 409 : message === "Job not found." ? 404 : 400 }
    )
  }
}
