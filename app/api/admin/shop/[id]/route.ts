import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

/**
 * PATCH /api/admin/shop/[id]
 *
 * Updates a shop item. All fields optional.
 * Body: { name?, description?, imageUrl?, price?, active?, sortOrder? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY)
  if (authCheck.error) return authCheck.error

  const { id } = await params

  const existing = await prisma.shopItem.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 })
  }

  const body = await request.json()
  const data: Record<string, unknown> = {}

  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim()
  if (typeof body.description === "string" && body.description.trim()) data.description = body.description.trim()
  if (body.imageUrl !== undefined) data.imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : null
  if (typeof body.price === "number" && Number.isInteger(body.price) && body.price > 0) data.price = body.price
  if (typeof body.active === "boolean") data.active = body.active
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder

  const updated = await prisma.shopItem.update({ where: { id }, data })

  return NextResponse.json(updated)
}

/**
 * DELETE /api/admin/shop/[id]
 *
 * Deletes a shop item.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY)
  if (authCheck.error) return authCheck.error

  const { id } = await params

  const existing = await prisma.shopItem.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 })
  }

  await prisma.shopItem.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
