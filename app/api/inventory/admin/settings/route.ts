import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"

export async function GET() {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  const settings = await prisma.inventorySettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", enabled: false },
  })

  return NextResponse.json({ enabled: settings.enabled })
}

export async function PATCH(request: Request) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  const { session } = result

  const body = await request.json()
  const { enabled } = body

  if (typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "enabled must be a boolean" },
      { status: 400 }
    )
  }

  const settings = await prisma.inventorySettings.upsert({
    where: { id: "singleton" },
    update: { enabled },
    create: { id: "singleton", enabled },
  })

  await logAdminAction(
    AuditAction.INVENTORY_SETTINGS_UPDATE,
    session.user.id,
    session.user.email,
    "InventorySettings",
    "singleton",
    { enabled }
  )

  return NextResponse.json({ enabled: settings.enabled })
}
