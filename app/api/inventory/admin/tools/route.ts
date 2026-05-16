import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"

const BULK_DELETE_CONFIRMATION = "DELETE ALL TOOLS"

export async function GET() {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  const tools = await prisma.tool.findMany({ orderBy: { name: "asc" } })
  return NextResponse.json(tools)
}

export async function POST(request: Request) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  const { session } = result

  const body = await request.json()
  const { name, description, imageUrl } = body

  if (!name || typeof name !== "string") {
    return NextResponse.json(
      { error: "Name is required" },
      { status: 400 }
    )
  }

  const { sanitizeName, sanitizeDescription, validateImageUrl } = await import("@/lib/inventory/validation")

  const safeName = sanitizeName(name)
  if (!safeName) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  const tool = await prisma.tool.create({
    data: {
      name: safeName,
      description: description ? sanitizeDescription(description) : null,
      imageUrl: validateImageUrl(imageUrl),
    },
  })

  await logAdminAction(
    AuditAction.INVENTORY_TOOL_CREATE,
    session.user.id,
    session.user.email,
    "Tool",
    tool.id,
    { name }
  )

  return NextResponse.json(tool, { status: 201 })
}

export async function DELETE(request: Request) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  const { session } = result
  const body = await request.json().catch(() => null)

  if (body?.confirmation !== BULK_DELETE_CONFIRMATION) {
    return NextResponse.json(
      { error: "Bulk tool deletion requires exact confirmation." },
      { status: 400 }
    )
  }

  const counts = await prisma.$transaction(async (tx) => {
    const rentals = await tx.toolRental.deleteMany()
    const tools = await tx.tool.deleteMany()
    return {
      toolCount: tools.count,
      rentalCount: rentals.count,
    }
  })

  await logAdminAction(
    AuditAction.INVENTORY_TOOL_DELETE,
    session.user.id,
    session.user.email,
    "ToolBulk",
    "all",
    counts
  )

  return NextResponse.json({ success: true, ...counts })
}
