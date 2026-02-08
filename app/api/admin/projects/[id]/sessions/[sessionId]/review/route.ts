import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { sanitize } from "@/lib/sanitize"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { logAdminAction, AuditAction } from "@/lib/audit"
import { awardCurrencyForBuildHoursInTx } from "@/lib/currency"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const authCheck = await requirePermission(Permission.REVIEW_SESSIONS)
  if (authCheck.error) return authCheck.error

  const { id: projectId, sessionId } = await params

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, userId: true, designStatus: true },
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

  if (hoursApproved > workSession.hoursClaimed * 2) {
    return NextResponse.json(
      { error: "hoursApproved cannot exceed twice the claimed hours" },
      { status: 400 }
    )
  }

  const updatedSession = await prisma.$transaction(async (tx) => {
    const session = await tx.workSession.update({
      where: { id: sessionId },
      data: {
        hoursApproved,
        reviewComments: typeof reviewComments === "string" ? sanitize(reviewComments) : null,
        reviewedAt: new Date(),
        reviewedBy: authCheck.session.user.id,
      },
      include: { media: true },
    })

    // Award currency for build hours (if design is approved and session is BUILD stage)
    if (
      project.designStatus === "approved" &&
      workSession.stage === "BUILD" &&
      hoursApproved > 0
    ) {
      await awardCurrencyForBuildHoursInTx(
        tx,
        project.userId,
        sessionId,
        projectId
      )
    }

    return session
  })

  await logAdminAction(
    AuditAction.ADMIN_REVIEW_SESSION,
    authCheck.session.user.id,
    authCheck.session.user.email ?? undefined,
    "WorkSession",
    sessionId,
    { hoursApproved, projectId }
  )

  return NextResponse.json(updatedSession)
}
