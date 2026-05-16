import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"
import { pushSSE } from "@/lib/inventory/sse"
import { notifyPrintUpdate } from "@/lib/inventory/notifications"
import {
  deleteManufacturingJob,
  readManufacturingState,
  updateManufacturingJob,
} from "@/lib/inventory/manufacturing"

type Context = {
  params: Promise<{ id: string }>
}

function badRequest(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Manufacturing job request failed." },
    { status: 400 }
  )
}

function validateJobPatch(body: unknown) {
  if (!body || typeof body !== "object") return {}
  const source = body as Record<string, unknown>
  const patch: Record<string, unknown> = {}

  if (source.status !== undefined) {
    if (typeof source.status !== "string") throw new Error("status must be a string.")
    patch.status = source.status
  }
  if (source.assignedPrinterId !== undefined) {
    if (source.assignedPrinterId !== null && typeof source.assignedPrinterId !== "string") {
      throw new Error("assignedPrinterId must be a string or null.")
    }
    patch.assignedPrinterId = source.assignedPrinterId
  }
  if (source.priority !== undefined) patch.priority = Boolean(source.priority)
  if (source.urgent !== undefined) patch.urgent = Boolean(source.urgent)
  if (source.staffNotes !== undefined) {
    if (source.staffNotes !== null && typeof source.staffNotes !== "string") {
      throw new Error("staffNotes must be a string or null.")
    }
    patch.staffNotes = source.staffNotes
  }
  if (source.markCollected !== undefined) patch.markCollected = Boolean(source.markCollected)
  if (source.markUncollected !== undefined) patch.markUncollected = Boolean(source.markUncollected)
  if (source.rejectReason !== undefined) {
    if (source.rejectReason !== null && typeof source.rejectReason !== "string") {
      throw new Error("rejectReason must be a string or null.")
    }
    patch.rejectReason = source.rejectReason
  }
  if (source.estimatedMinutes !== undefined) {
    const estimatedMinutes = Math.round(Number(source.estimatedMinutes))
    if (!Number.isFinite(estimatedMinutes) || estimatedMinutes <= 0) {
      throw new Error("estimatedMinutes must be greater than 0.")
    }
    patch.estimatedMinutes = estimatedMinutes
  }
  if (source.forceOverBudget !== undefined) patch.forceOverBudget = Boolean(source.forceOverBudget)

  if (Object.keys(patch).length === 0) throw new Error("No accepted job fields provided.")
  return patch
}

function printUpdateTitle(patch: Record<string, unknown>) {
  switch (patch.status) {
    case "TIME_APPROVAL_REQUESTED":
      return "Print Time Approval Requested"
    case "QUEUED":
      return "Print Queued"
    case "PRINTING":
      return "Print Started"
    case "READY":
      return "Print Ready"
    case "COMPLETED":
      return "Print Picked Up"
    case "REJECTED":
    case "REJECTED_BY_ORGANIZER":
    case "REJECTED_BY_PRINTER":
    case "CANCELLED":
      return "Print Rejected"
    default:
      return patch.markCollected ? "Print Picked Up" : "Print Updated"
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  try {
    const { id } = await params
    const body = await request.json()
    const validatedFields = validateJobPatch(body)
    const job = await updateManufacturingJob(id, validatedFields)
    await logAdminAction(
      AuditAction.INVENTORY_ORDER_STATUS_UPDATE,
      result.session.user.id,
      result.session.user.email,
      "ManufacturingJob",
      id,
      validatedFields
    )
    pushSSE(job.teamId, { type: "manufacturing_job_updated", data: job })
    notifyPrintUpdate(
      job.teamId,
      job,
      printUpdateTitle(validatedFields),
      typeof validatedFields.rejectReason === "string" ? validatedFields.rejectReason : undefined
    )
    return NextResponse.json({
      job,
      state: await readManufacturingState(result.session.user.id, { includeAll: true }),
    })
  } catch (error) {
    return badRequest(error)
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  try {
    const { id } = await params
    await deleteManufacturingJob(id)
    await logAdminAction(
      AuditAction.INVENTORY_ORDER_STATUS_UPDATE,
      result.session.user.id,
      result.session.user.email,
      "ManufacturingJob",
      id,
      { deleted: true }
    )
    return NextResponse.json({
      state: await readManufacturingState(result.session.user.id, { includeAll: true }),
    })
  } catch (error) {
    return badRequest(error)
  }
}
