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
    description: ((item.description as string) || null),
    imageUrl: ((item.imageUrl ?? item.image_url) as string) || null,
    stock: Number(item.stock) || 0,
    category: item.category as string,
    maxPerTeam: Number(item.maxPerTeam ?? item.max_per_team) || 0,
  }))

  await prisma.$transaction(
    data.map((item) =>
      prisma.item.upsert({
        where: { name: item.name },
        update: {
          description: item.description,
          imageUrl: item.imageUrl,
          stock: item.stock,
          category: item.category,
          maxPerTeam: item.maxPerTeam,
        },
        create: item,
      })
    )
  )

  await logAdminAction(
    AuditAction.INVENTORY_IMPORT,
    session.user.id,
    session.user.email,
    "Item",
    undefined,
    { count: data.length }
  )

  return NextResponse.json({ imported: data.length }, { status: 201 })
}
