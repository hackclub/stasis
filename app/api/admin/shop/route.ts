import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

/**
 * GET /api/admin/shop
 *
 * Returns all shop items (including inactive), ordered by sortOrder then createdAt.
 */
export async function GET() {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY)
  if (authCheck.error) return authCheck.error

  const items = await prisma.shopItem.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  })

  return NextResponse.json({ items })
}

/**
 * POST /api/admin/shop
 *
 * Creates a new shop item.
 * Body: { name, description, imageUrl?, price, sortOrder? }
 */
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY)
  if (authCheck.error) return authCheck.error

  const body = await request.json()
  const { name, description, imageUrl, price, sortOrder } = body

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }
  if (typeof description !== "string" || !description.trim()) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 })
  }
  if (typeof price !== "number" || !Number.isInteger(price) || price <= 0) {
    return NextResponse.json({ error: "Price must be a positive integer" }, { status: 400 })
  }

  const item = await prisma.shopItem.create({
    data: {
      name: name.trim(),
      description: description.trim(),
      imageUrl: typeof imageUrl === "string" ? imageUrl : null,
      price,
      sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
    },
  })

  return NextResponse.json(item, { status: 201 })
}
