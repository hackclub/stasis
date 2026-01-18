import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { sanitize } from "@/lib/sanitize"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; bomId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id, bomId } = await params
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  })

  const project = await prisma.project.findUnique({
    where: { id },
    select: { userId: true, designStatus: true },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id && !user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (project.designStatus === "in_review") {
    return NextResponse.json(
      { error: "Cannot update BOM items while design is in review" },
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

  if (bomItem.status !== "pending") {
    return NextResponse.json(
      { error: "Can only update pending BOM items" },
      { status: 403 }
    )
  }

  const body = await request.json()

  const updateData: {
    name?: string
    purpose?: string | null
    costPerItem?: number
    quantity?: number
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
  if (body.costPerItem !== undefined) {
    if (typeof body.costPerItem !== "number") {
      return NextResponse.json({ error: "costPerItem must be a number" }, { status: 400 })
    }
    updateData.costPerItem = body.costPerItem
  }
  if (body.quantity !== undefined) {
    if (typeof body.quantity !== "number" || !Number.isInteger(body.quantity)) {
      return NextResponse.json({ error: "quantity must be an integer" }, { status: 400 })
    }
    updateData.quantity = body.quantity
  }
  if (body.link !== undefined) {
    updateData.link = body.link ? sanitize(body.link) : null
  }
  if (body.distributor !== undefined) {
    updateData.distributor = body.distributor ? sanitize(body.distributor) : null
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
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  })

  const project = await prisma.project.findUnique({
    where: { id },
    select: { userId: true, designStatus: true },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id && !user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (project.designStatus === "in_review") {
    return NextResponse.json(
      { error: "Cannot delete BOM items while design is in review" },
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

  if (bomItem.status !== "pending") {
    return NextResponse.json(
      { error: "Can only delete pending BOM items" },
      { status: 403 }
    )
  }

  await prisma.bOMItem.delete({ where: { id: bomId } })

  return NextResponse.json({ success: true })
}
