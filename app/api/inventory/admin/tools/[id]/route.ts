import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  const { session } = result
  const { id } = await params

  const existing = await prisma.tool.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Tool not found" }, { status: 404 })

  const body = await request.json()
  const { name, description, imageUrl } = body

  if (name !== undefined && typeof name !== "string") {
    return NextResponse.json({ error: "Name must be a string" }, { status: 400 })
  }
  if (description !== undefined && description !== null && typeof description !== "string") {
    return NextResponse.json({ error: "Description must be a string" }, { status: 400 })
  }
  if (imageUrl !== undefined && imageUrl !== null && typeof imageUrl !== "string") {
    return NextResponse.json({ error: "Image URL must be a string" }, { status: 400 })
  }

  const { sanitizeName, sanitizeDescription, validateImageUrl } = await import("@/lib/inventory/validation")

  const tool = await prisma.tool.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: sanitizeName(name) }),
      ...(description !== undefined && { description: description ? sanitizeDescription(description) : null }),
      ...(imageUrl !== undefined && { imageUrl: validateImageUrl(imageUrl) }),
    },
  })

  await logAdminAction(
    AuditAction.INVENTORY_TOOL_UPDATE,
    session.user.id,
    session.user.email,
    "Tool",
    tool.id,
    body
  )

  return NextResponse.json(tool)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  const { session } = result
  const { id } = await params

  const existing = await prisma.tool.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Tool not found" }, { status: 404 })

  const activeRental = await prisma.toolRental.findFirst({
    where: { toolId: id, status: "CHECKED_OUT" },
  })
  if (activeRental) {
    return NextResponse.json(
      { error: "Cannot delete a tool that is currently rented out" },
      { status: 400 }
    )
  }

  await prisma.tool.delete({ where: { id } })

  await logAdminAction(
    AuditAction.INVENTORY_TOOL_DELETE,
    session.user.id,
    session.user.email,
    "Tool",
    id,
    { name: existing.name }
  )

  return NextResponse.json({ success: true })
}
