import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { updateManufacturingTeam } from "@/lib/inventory/manufacturing"

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
    return NextResponse.json(team)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update manufacturing allowance" },
      { status: 400 }
    )
  }
}
