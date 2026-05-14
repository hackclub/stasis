import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"
import {
  createManufacturingPrinter,
  listManufacturingPrinters,
  readManufacturingState,
} from "@/lib/inventory/manufacturing"

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
      { printer, state: await readManufacturingState(result.session.user.id) },
      { status: 201 }
    )
  } catch (error) {
    return badRequest(error)
  }
}
