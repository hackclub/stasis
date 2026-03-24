import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"

export async function POST(request: Request) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  const { session } = result

  const body = await request.json()
  const { name, description, imageUrl, stock, category, maxPerTeam } = body

  if (!name || stock == null || !category || maxPerTeam == null) {
    return NextResponse.json(
      { error: "Missing required fields: name, stock, category, maxPerTeam" },
      { status: 400 }
    )
  }

  const item = await prisma.item.create({
    data: {
      name,
      description: description ?? null,
      imageUrl: imageUrl ?? null,
      stock,
      category,
      maxPerTeam,
    },
  })

  await logAdminAction(
    AuditAction.INVENTORY_ITEM_CREATE,
    session.user.id,
    session.user.email,
    "Item",
    item.id,
    { name, stock, category, maxPerTeam }
  )

  return NextResponse.json(item, { status: 201 })
}
