import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const adminCheck = await requireAdmin()
  if (adminCheck.error) return adminCheck.error

  const { id: projectId, sessionId } = await params

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const workSession = await prisma.workSession.findUnique({
    where: { id: sessionId, projectId },
  })

  if (!workSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }

  const body = await request.json()
  const { hoursApproved, reviewComments } = body

  if (typeof hoursApproved !== "number" || hoursApproved < 0) {
    return NextResponse.json(
      { error: "hoursApproved must be a non-negative number" },
      { status: 400 }
    )
  }

  const updatedSession = await prisma.workSession.update({
    where: { id: sessionId },
    data: {
      hoursApproved,
      reviewComments: typeof reviewComments === "string" ? reviewComments : null,
      reviewedAt: new Date(),
      reviewedBy: adminCheck.session.user.id,
    },
    include: { media: true },
  })

  return NextResponse.json(updatedSession)
}
