import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { sanitize } from "@/lib/sanitize"
import { isValidUrl } from "@/lib/url"
import { getUserRoles, hasRole, Role } from "@/lib/permissions"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const roles = await getUserRoles(session.user.id)
  const isAdmin = hasRole(roles, Role.ADMIN)

  const project = await prisma.project.findUnique({
    where: { id },
    select: { userId: true, designStatus: true },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (project.designStatus === "in_review") {
    return NextResponse.json(
      { error: "Cannot add BOM items while design is in review" },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { items } = body

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items must be a non-empty array" }, { status: 400 })
  }

  if (items.length > 200) {
    return NextResponse.json({ error: "Maximum 200 items per import" }, { status: 400 })
  }

  const errors: { row: number; error: string }[] = []
  const validItems: { name: string; purpose: string | null; quantity: number | null; totalCost: number; link: string | null; distributor: string | null }[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const row = i + 1

    if (!item.name || typeof item.name !== "string" || !item.name.trim()) {
      errors.push({ row, error: "name is required" })
      continue
    }

    let qty: number | null = null
    if (item.quantity != null && item.quantity !== "") {
      const cleaned = String(item.quantity).replace(/[^0-9]/g, "")
      qty = cleaned ? parseInt(cleaned, 10) : null
      if (qty != null && qty < 1) {
        errors.push({ row, error: "quantity must be a positive integer" })
        continue
      }
    }

    let total: number | null = null
    if (item.totalCost != null && item.totalCost !== "") {
      const cleaned = String(item.totalCost).replace(/[^0-9.\-]/g, "")
      total = cleaned ? parseFloat(cleaned) : null
      if (total == null || isNaN(total) || total < 0) {
        errors.push({ row, error: "totalCost must be a non-negative number" })
        continue
      }
    }

    if (total == null) {
      errors.push({ row, error: "totalCost is required" })
      continue
    }

    validItems.push({
      name: sanitize(item.name.trim()),
      purpose: item.purpose ? sanitize(item.purpose.trim()) : null,
      quantity: qty,
      totalCost: total,
      link: item.link && isValidUrl(item.link.trim()) ? sanitize(item.link.trim()) : null,
      distributor: item.distributor ? sanitize(item.distributor.trim()) : null,
    })
  }

  if (validItems.length === 0) {
    return NextResponse.json({ error: "No valid items to import", errors }, { status: 400 })
  }

  await prisma.bOMItem.createMany({
    data: validItems.map((item) => ({
      ...item,
      projectId: id,
    })),
  })

  return NextResponse.json({
    imported: validItems.length,
    errors,
  }, { status: 201 })
}
