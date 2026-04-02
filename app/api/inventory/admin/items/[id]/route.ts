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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  const { session } = result
  const { id } = await params

  const existing = await prisma.item.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Item not found" }, { status: 404 })

  const body = await request.json()
  const { name, description, imageUrl, stock, category, maxPerTeam } = body

  if (stock !== undefined && !validateNonNegativeInt(stock)) {
    return NextResponse.json({ error: "stock must be a non-negative integer" }, { status: 400 })
  }
  if (maxPerTeam !== undefined && !validatePositiveInt(maxPerTeam)) {
    return NextResponse.json({ error: "maxPerTeam must be a positive integer" }, { status: 400 })
  }

  const item = await prisma.item.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: sanitizeName(name) }),
      ...(description !== undefined && { description: description ? sanitizeDescription(description) : null }),
      ...(imageUrl !== undefined && { imageUrl: validateImageUrl(imageUrl) }),
      ...(stock !== undefined && { stock }),
      ...(category !== undefined && { category: sanitizeName(category) }),
      ...(maxPerTeam !== undefined && { maxPerTeam }),
    },
  })

  await logAdminAction(
    AuditAction.INVENTORY_ITEM_UPDATE,
    session.user.id,
    session.user.email,
    "Item",
    item.id,
    body
  )

  return NextResponse.json(item)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  const { session } = result
  const { id } = await params

  const existing = await prisma.item.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Item not found" }, { status: 404 })

  await prisma.item.delete({ where: { id } })

  await logAdminAction(
    AuditAction.INVENTORY_ITEM_DELETE,
    session.user.id,
    session.user.email,
    "Item",
    id,
    { name: existing.name }
  )

  return NextResponse.json({ success: true })
}
