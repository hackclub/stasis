import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"

export async function POST(request: Request) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  const { session } = result

  const body = await request.json()
  const { items } = body

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "Request body must contain a non-empty items array" },
      { status: 400 }
    )
  }

  const data = items.map((item: Record<string, unknown>) => ({
    name: item.name as string,
    description: (item.description as string) ?? null,
    imageUrl: (item.imageUrl as string) ?? null,
    stock: item.stock as number,
    category: item.category as string,
    maxPerTeam: item.maxPerTeam as number,
  }))

  const result2 = await prisma.item.createMany({ data })

  await logAdminAction(
    AuditAction.INVENTORY_IMPORT,
    session.user.id,
    session.user.email,
    "Item",
    undefined,
    { count: result2.count }
  )

  return NextResponse.json({ imported: result2.count }, { status: 201 })
}
