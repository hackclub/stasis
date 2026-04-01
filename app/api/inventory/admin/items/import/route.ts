import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"
import {
  sanitizeName,
  sanitizeDescription,
  validateImageUrl,
} from "@/lib/inventory/validation"

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

  if (items.length > 500) {
    return NextResponse.json(
      { error: "Cannot import more than 500 items at once" },
      { status: 400 }
    )
  }

  const data = items.map((item: Record<string, unknown>) => {
    const stock = Math.max(0, Math.floor(Number(item.stock) || 0))
    const maxPerTeam = Math.max(0, Math.floor(Number(item.maxPerTeam ?? item.max_per_team) || 0))
    if (!Number.isFinite(stock) || !Number.isFinite(maxPerTeam)) {
      throw new Error("Invalid numeric values in import data")
    }
    if (maxPerTeam <= 0) {
      throw new Error(`maxPerTeam must be a positive integer for item "${sanitizeName(String(item.name ?? ""))}"`)
    }
    return {
      name: sanitizeName(String(item.name ?? "")),
      description: item.description ? sanitizeDescription(String(item.description)) : null,
      imageUrl: validateImageUrl(item.imageUrl ?? item.image_url),
      stock,
      category: sanitizeName(String(item.category ?? "")),
      maxPerTeam,
    }
  })

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
