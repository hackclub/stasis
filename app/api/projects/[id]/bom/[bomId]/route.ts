import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { sanitize } from "@/lib/sanitize"
import { isValidUrl } from "@/lib/url"
import { getUserRoles, hasRole, Role } from "@/lib/permissions"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; bomId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id, bomId } = await params
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
      { error: "Cannot update BOM items after design approval or while in review" },
      { status: 403 }
    )
  }

  const bomItem = await prisma.bOMItem.findUnique({
    where: { id: bomId },
  })

  if (!bomItem) {
    return NextResponse.json({ error: "BOM item not found" }, { status: 404 })
  }

  if (bomItem.projectId !== id) {
    return NextResponse.json({ error: "BOM item does not belong to this project" }, { status: 400 })
  }

  const body = await request.json()

  const updateData: {
    name?: string
    purpose?: string | null
    quantity?: number | null
    totalCost?: number
    link?: string | null
    distributor?: string | null
  } = {}

  if (body.name !== undefined) {
    if (typeof body.name !== "string") {
      return NextResponse.json({ error: "name must be a string" }, { status: 400 })
    }
    updateData.name = sanitize(body.name)
  }
  if (body.purpose !== undefined) {
    updateData.purpose = body.purpose ? sanitize(body.purpose) : null
  }
  if (body.quantity !== undefined) {
    if (body.quantity === null) {
      updateData.quantity = null
    } else if (typeof body.quantity !== "number" || !Number.isInteger(body.quantity) || body.quantity < 1) {
      return NextResponse.json({ error: "quantity must be a positive integer" }, { status: 400 })
    } else {
      updateData.quantity = body.quantity
    }
  }
  if (body.link !== undefined) {
    updateData.link = body.link && isValidUrl(body.link) ? sanitize(body.link) : null
  }
  if (body.distributor !== undefined) {
    updateData.distributor = body.distributor ? sanitize(body.distributor) : null
  }
  if (body.totalCost !== undefined) {
    if (typeof body.totalCost !== "number" || body.totalCost < 0) {
      return NextResponse.json({ error: "totalCost must be a non-negative number" }, { status: 400 })
    }
    updateData.totalCost = body.totalCost
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const updatedBomItem = await prisma.bOMItem.update({
    where: { id: bomId },
    data: updateData,
  })

  return NextResponse.json(updatedBomItem)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; bomId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id, bomId } = await params
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

  const bomItem = await prisma.bOMItem.findUnique({
    where: { id: bomId },
  })

  if (!bomItem) {
    return NextResponse.json({ error: "BOM item not found" }, { status: 404 })
  }

  if (bomItem.projectId !== id) {
    return NextResponse.json({ error: "BOM item does not belong to this project" }, { status: 400 })
  }

  await prisma.bOMItem.delete({ where: { id: bomId } })

  return NextResponse.json({ success: true })
}
