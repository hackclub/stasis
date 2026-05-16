import { NextResponse } from "next/server"
import type { ManufacturingJobStatus } from "@/app/generated/prisma/client"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"
import {
  createManufacturingPrinter,
  listManufacturingPrinters,
  readManufacturingState,
} from "@/lib/inventory/manufacturing"

const BULK_DELETE_CONFIRMATION = "DELETE ALL PRINTERS"
const OPEN_PRINT_JOB_STATUSES: ManufacturingJobStatus[] = [
  "PENDING",
  "TIME_APPROVAL_REQUESTED",
  "QUEUED",
  "PRINTING",
]

function badRequest(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Could not create printer." },
    { status: 400 }
  )
}

export async function GET() {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  return NextResponse.json(await listManufacturingPrinters())
}

export async function POST(request: Request) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const printer = await createManufacturingPrinter(body)
    await logAdminAction(
      AuditAction.INVENTORY_TOOL_CREATE,
      result.session.user.id,
      result.session.user.email,
      "ManufacturingPrinter",
      printer.id,
      { name: printer.name }
    )
    return NextResponse.json(
      { printer, state: await readManufacturingState(result.session.user.id, { includeAll: true }) },
      { status: 201 }
    )
  } catch (error) {
    return badRequest(error)
  }
}

export async function DELETE(request: Request) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  const body = await request.json().catch(() => null)

  if (body?.confirmation !== BULK_DELETE_CONFIRMATION) {
    return NextResponse.json(
      { error: "Bulk printer deletion requires exact confirmation." },
      { status: 400 }
    )
  }

  const counts = await prisma.$transaction(async (tx) => {
    const cancelledJobs = await tx.manufacturingJob.updateMany({
      where: { status: { in: OPEN_PRINT_JOB_STATUSES } },
      data: {
        status: "CANCELLED",
        assignedPrinterId: null,
        startedAt: null,
        timeEstimateRequestedAt: null,
        timeApprovedAt: null,
      },
    })
    const unassignedJobs = await tx.manufacturingJob.updateMany({
      where: { assignedPrinterId: { not: null } },
      data: { assignedPrinterId: null },
    })
    const printers = await tx.manufacturingPrinter.deleteMany()

    return {
      printerCount: printers.count,
      cancelledPrintJobCount: cancelledJobs.count,
      unassignedJobCount: unassignedJobs.count,
    }
  })

  await logAdminAction(
    AuditAction.INVENTORY_TOOL_DELETE,
    result.session.user.id,
    result.session.user.email,
    "ManufacturingPrinterBulk",
    "all",
    counts
  )

  return NextResponse.json({
    success: true,
    ...counts,
    state: await readManufacturingState(result.session.user.id, { includeAll: true }),
  })
}
