import { NextResponse } from "next/server"
import { requireInventoryAccess } from "@/lib/inventory/access"
import { pushSSE } from "@/lib/inventory/sse"
import { notifyPrintUpdate } from "@/lib/inventory/notifications"
import { logAudit, AuditAction } from "@/lib/audit"
import {
  createManufacturingJob,
  readManufacturingState,
} from "@/lib/inventory/manufacturing"

function badRequest(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Could not create print job." },
    { status: 400 }
  )
}

export async function GET() {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error

  return NextResponse.json(await readManufacturingState(result.session.user.id))
}

export async function POST(request: Request) {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const job = await createManufacturingJob(result.session.user.id, body, false)
    const state = await readManufacturingState(result.session.user.id)
    logAudit({
      action: AuditAction.INVENTORY_ORDER_PLACE,
      actorId: result.session.user.id,
      actorEmail: result.session.user.email,
      targetType: "ManufacturingJob",
      targetId: job.id,
      metadata: {
        teamId: job.teamId,
        projectName: job.projectName,
        status: job.status,
        urgent: job.urgent,
      },
    }).catch(() => {})
    pushSSE(job.teamId, { type: "manufacturing_job_created", data: job })
    notifyPrintUpdate(job.teamId, job, "Print Requested")

    return NextResponse.json(
      { job, state },
      { status: 201 }
    )
  } catch (error) {
    return badRequest(error)
  }
}
