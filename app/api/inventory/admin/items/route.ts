import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"
import {
  sanitizeName,
  sanitizeDescription,
  validateImageUrl,
  validateNonNegativeInt,
  validatePositiveInt,
} from "@/lib/inventory/validation"

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

  if (!validateNonNegativeInt(stock) || !validatePositiveInt(maxPerTeam)) {
    return NextResponse.json(
      { error: "stock must be a non-negative integer and maxPerTeam must be a positive integer" },
      { status: 400 }
    )
  }

  const safeName = sanitizeName(name)
  const safeCategory = sanitizeName(category)
  if (!safeName || !safeCategory) {
    return NextResponse.json(
      { error: "Name and category are required" },
      { status: 400 }
    )
  }
  const safeDescription = description ? sanitizeDescription(description) : null
  const safeImageUrl = validateImageUrl(imageUrl)

  const item = await prisma.item.create({
    data: {
      name: safeName,
      description: safeDescription,
      imageUrl: safeImageUrl,
      stock,
      category: safeCategory,
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
