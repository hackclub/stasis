import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { updateManufacturingTeam } from "@/lib/inventory/manufacturing"
import { logAdminAction, AuditAction } from "@/lib/audit"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  try {
    const { id } = await params
    const body = await request.json()
    const team = await updateManufacturingTeam(id, body)
    await logAdminAction(
      AuditAction.INVENTORY_SETTINGS_UPDATE,
      result.session.user.id,
      result.session.user.email,
      "Team",
      id,
      {
        allowanceMinutes: body?.allowanceMinutes,
        maxMembersOverride: body?.maxMembersOverride ?? null,
        manufacturingAutoApprovePrints: body?.manufacturingAutoApprovePrints,
      }
    )
    return NextResponse.json(team)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update manufacturing allowance" },
      { status: 400 }
    )
  }
}
