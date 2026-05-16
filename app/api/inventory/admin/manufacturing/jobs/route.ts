import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import {
  createManufacturingJob,
  OPEN_JOB_STATUSES,
  readManufacturingState,
} from "@/lib/inventory/manufacturing"
import { notifyPrintUpdate } from "@/lib/inventory/notifications"
import { logAdminAction, AuditAction } from "@/lib/audit"

function badRequest(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Could not create print job." },
    { status: 400 }
  )
}

export async function POST(request: Request) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const job = await createManufacturingJob(result.session.user.id, body, true)
    const state = await readManufacturingState(result.session.user.id, { includeAll: true })
    const queuePosition =
      state.jobs
        .filter((candidate) => OPEN_JOB_STATUSES.includes(candidate.status))
        .findIndex((candidate) => candidate.id === job.id) + 1
    await logAdminAction(
      AuditAction.INVENTORY_ORDER_PLACE,
      result.session.user.id,
      result.session.user.email,
      "ManufacturingJob",
      job.id,
      {
        teamId: job.teamId,
        projectName: job.projectName,
        status: job.status,
        urgent: job.urgent,
      }
    )
    notifyPrintUpdate(job.teamId, job, "Print Requested")

    return NextResponse.json(
      { job, queuePosition: Math.max(queuePosition, 1), state },
      { status: 201 }
    )
  } catch (error) {
    return badRequest(error)
  }
}
