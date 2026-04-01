import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { sanitize } from "@/lib/sanitize"
import { isValidUrl } from "@/lib/url"
import { getUserRoles, hasRole, Role } from "@/lib/permissions"

export async function DELETE(
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
    select: { userId: true, deletedAt: true, designStatus: true },
  })

  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (project.designStatus === "in_review" || project.designStatus === "approved") {
    return NextResponse.json(
      { error: "Cannot delete BOM items after design approval or while in review" },
      { status: 403 }
    )
  }

  const { count } = await prisma.bOMItem.deleteMany({
    where: { projectId: id },
  })

  return NextResponse.json({ success: true, deletedCount: count })
}

export async function GET(
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
    select: { userId: true, deletedAt: true },
  })

  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const bomItems = await prisma.bOMItem.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(bomItems)
}

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
    select: { userId: true, deletedAt: true, designStatus: true },
  })

  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // BOM is part of design stage
  if (project.designStatus === "in_review") {
    return NextResponse.json(
      { error: "Cannot add BOM items while design is in review" },
      { status: 403 }
    )
  }

  const body = await request.json()

  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 })
  }
  if (body.totalCost == null || typeof body.totalCost !== "number" || body.totalCost < 0) {
    return NextResponse.json({ error: "totalCost must be a non-negative number" }, { status: 400 })
  }
  if (body.quantity != null && (typeof body.quantity !== "number" || !Number.isInteger(body.quantity) || body.quantity < 1)) {
    return NextResponse.json({ error: "quantity must be a positive integer" }, { status: 400 })
  }

  const bomItem = await prisma.bOMItem.create({
    data: {
      name: sanitize(body.name),
      purpose: body.purpose ? sanitize(body.purpose) : null,
      quantity: body.quantity ?? null,
      totalCost: body.totalCost,
      link: body.link && isValidUrl(body.link) ? sanitize(body.link) : null,
      distributor: body.distributor ? sanitize(body.distributor) : null,
      projectId: id,
    },
  })

  return NextResponse.json(bomItem, { status: 201 })
}
