import { NextResponse } from "next/server"
import { requireInventoryAccess } from "@/lib/inventory/access"
import { readManufacturingState } from "@/lib/inventory/manufacturing"

export async function GET() {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error

  return NextResponse.json(
    await readManufacturingState(result.session.user.id, { includeAll: result.access.isAdmin })
  )
}
