import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; bomId: string }> }
) {
  const adminCheck = await requireAdmin()
  if (adminCheck.error) return adminCheck.error

  const { id: projectId, bomId } = await params

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const bomItem = await prisma.bOMItem.findUnique({
    where: { id: bomId, projectId },
  })

  if (!bomItem) {
    return NextResponse.json({ error: "BOM item not found" }, { status: 404 })
  }

  const body = await request.json()
  const { status, reviewComments } = body

  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json(
      { error: "status must be 'approved' or 'rejected'" },
      { status: 400 }
    )
  }

  const updatedBOMItem = await prisma.bOMItem.update({
    where: { id: bomId },
    data: {
      status,
      reviewComments: typeof reviewComments === "string" ? reviewComments : null,
      reviewedAt: new Date(),
      reviewedBy: adminCheck.session.user.id,
    },
  })

  return NextResponse.json(updatedBOMItem)
}
