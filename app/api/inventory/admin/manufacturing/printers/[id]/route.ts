import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"
import { pushSSE } from "@/lib/inventory/sse"
import { notifyPrintUpdate } from "@/lib/inventory/notifications"
import {
  deleteManufacturingPrinter,
  readManufacturingState,
  updateManufacturingPrinter,
} from "@/lib/inventory/manufacturing"

type Context = {
  params: Promise<{ id: string }>
}

function badRequest(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Printer request failed." },
    { status: 400 }
  )
}

function loggedPrinterFields(body: unknown) {
  if (!body || typeof body !== "object") return {}
  const source = body as Record<string, unknown>
  const fields: Record<string, unknown> = {}
  if (typeof source.name === "string") fields.name = source.name
  if (typeof source.status === "string") fields.status = source.status
  if (typeof source.notes === "string") fields.notes = source.notes.slice(0, 500)
  if (source.sortOrder !== undefined) fields.sortOrder = source.sortOrder
  if (source.assignNext !== undefined) fields.assignNext = Boolean(source.assignNext)
  if (source.estimatedMinutes !== undefined) fields.estimatedMinutes = source.estimatedMinutes
  if (source.forceOverBudget !== undefined) fields.forceOverBudget = Boolean(source.forceOverBudget)
  if (source.completeCurrent !== undefined) fields.completeCurrent = Boolean(source.completeCurrent)
  return fields
}

export async function PATCH(request: Request, { params }: Context) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  try {
    const { id } = await params
    const body = await request.json()
    const printer = await updateManufacturingPrinter(id, body)
    await logAdminAction(
      AuditAction.INVENTORY_TOOL_UPDATE,
      result.session.user.id,
      result.session.user.email,
      "ManufacturingPrinter",
      printer.id,
      loggedPrinterFields(body)
    )
    const state = await readManufacturingState(result.session.user.id, { includeAll: true })
    const changedJobId = printer.currentJobId ?? printer.lastCompletedJobId
    const changedJob = changedJobId ? state.jobs.find((job) => job.id === changedJobId) : null
    if (changedJob) {
      pushSSE(changedJob.teamId, { type: "manufacturing_job_updated", data: changedJob })
      notifyPrintUpdate(
        changedJob.teamId,
        changedJob,
        body?.completeCurrent ? "Print Ready" : "Print Started"
      )
    } else {
      pushSSE("manufacturing", { type: "manufacturing_printer_updated", data: printer })
    }
    return NextResponse.json({
      printer,
      state,
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
    const printer = await deleteManufacturingPrinter(id)
    await logAdminAction(
      AuditAction.INVENTORY_TOOL_DELETE,
      result.session.user.id,
      result.session.user.email,
      "ManufacturingPrinter",
      id,
      { name: printer.name }
    )
    return NextResponse.json({
      success: true,
      state: await readManufacturingState(result.session.user.id, { includeAll: true }),
    })
  } catch (error) {
    return badRequest(error)
  }
}
