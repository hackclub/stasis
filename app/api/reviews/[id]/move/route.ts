import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdmin()
  if (authCheck.error) return authCheck.error

  const { id } = await params
  const body = await request.json()
  const { targetStage } = body // "DESIGN" or "BUILD"

  if (targetStage !== "DESIGN" && targetStage !== "BUILD") {
    return NextResponse.json(
      { error: "targetStage must be DESIGN or BUILD" },
      { status: 400 }
    )
  }

  const submission = await prisma.projectSubmission.findUnique({
    where: { id },
    include: { project: true },
  })

  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 })
  }

  if (submission.stage === targetStage) {
    return NextResponse.json({ error: "Already in that queue" }, { status: 400 })
  }

  await prisma.projectSubmission.update({
    where: { id },
    data: { stage: targetStage },
  })

  await logAdminAction(
    AuditAction.ADMIN_MOVE_QUEUE,
    authCheck.session.user.id,
    authCheck.session.user.email ?? undefined,
    "ProjectSubmission",
    id,
    { from: submission.stage, to: targetStage }
  )

  return NextResponse.json({ ok: true })
}
