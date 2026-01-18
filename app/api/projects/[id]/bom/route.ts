import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { sanitize } from "@/lib/sanitize"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  })

  const project = await prisma.project.findUnique({
    where: { id },
    select: { userId: true },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id && !user?.isAdmin) {
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
  if (typeof body.costPerItem !== "number") {
    return NextResponse.json({ error: "costPerItem is required" }, { status: 400 })
  }
  if (typeof body.quantity !== "number" || !Number.isInteger(body.quantity)) {
    return NextResponse.json({ error: "quantity must be an integer" }, { status: 400 })
  }

  const bomItem = await prisma.bOMItem.create({
    data: {
      name: sanitize(body.name),
      purpose: body.purpose ? sanitize(body.purpose) : null,
      costPerItem: body.costPerItem,
      quantity: body.quantity,
      link: body.link ? sanitize(body.link) : null,
      distributor: body.distributor ? sanitize(body.distributor) : null,
      projectId: id,
    },
  })

  return NextResponse.json(bomItem, { status: 201 })
}
