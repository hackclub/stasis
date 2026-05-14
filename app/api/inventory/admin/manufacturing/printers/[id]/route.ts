import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"
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
      body
    )
    return NextResponse.json({
      printer,
      state: await readManufacturingState(result.session.user.id),
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
      state: await readManufacturingState(result.session.user.id),
    })
  } catch (error) {
    return badRequest(error)
  }
}
