import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { sanitize } from "@/lib/sanitize"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireAdmin()
  if (adminCheck.error) return adminCheck.error

  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    include: { workSessions: true },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const body = await request.json()
  const { decision, reviewComments } = body

  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json(
      { error: "decision must be 'approved' or 'rejected'" },
      { status: 400 }
    )
  }

  if (project.status !== "in_review" && project.status !== "update_requested") {
    return NextResponse.json(
      { error: "Project is not pending review" },
      { status: 400 }
    )
  }

  const adminUserId = adminCheck.session.user.id
  const now = new Date()

  if (decision === "approved") {
    const sessionsToAutoApprove = project.workSessions.filter(
      (s) => s.hoursApproved === null
    )

    for (const session of sessionsToAutoApprove) {
      await prisma.workSession.update({
        where: { id: session.id },
        data: {
          hoursApproved: session.hoursClaimed,
          reviewedAt: now,
          reviewedBy: adminUserId,
        },
      })
    }

    await prisma.projectBadge.updateMany({
      where: { projectId: id, grantedAt: null },
      data: {
        grantedAt: now,
        grantedBy: adminUserId,
      },
    })
  }

  const updatedProject = await prisma.project.update({
    where: { id },
    data: {
      status: decision,
      reviewComments: typeof reviewComments === "string" ? sanitize(reviewComments) : null,
      reviewedAt: now,
      reviewedBy: adminUserId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
      workSessions: {
        include: { media: true },
        orderBy: { createdAt: "desc" },
      },
      badges: true,
    },
  })

  return NextResponse.json(updatedProject)
}
