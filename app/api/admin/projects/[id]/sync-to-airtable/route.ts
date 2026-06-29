import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { syncProjectToAirtable } from "@/lib/airtable"
import { buildHoursJustification } from "@/lib/justification"

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdmin()
  if (authCheck.error) return authCheck.error

  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      workSessions: true,
      user: { select: { name: true, email: true, slackId: true } },
    },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const designSessions = project.workSessions.filter((s) => s.stage === "DESIGN")
  const designHours = designSessions.reduce((sum, s) => sum + s.hoursClaimed, 0)
  const isBuildApproved = project.buildStatus === "approved"

  // Grant amount locked in at design approval
  const designReviewAction = await prisma.projectReviewAction.findFirst({
    where: { projectId: id, stage: "DESIGN", decision: "APPROVED" },
    orderBy: { createdAt: "desc" },
    select: { grantAmount: true },
  })
  const grantAmount = designReviewAction?.grantAmount ?? null

  // Re-sync mode: no live reviewer, so buildHoursJustification reconstructs the
  // second-pass section from the latest persisted review for each stage.
  let designJustification: string | undefined
  if (project.designStatus === "approved") {
    designJustification = await buildHoursJustification({ projectId: id, stage: "DESIGN" })
  }

  let buildJustification: string | undefined
  if (isBuildApproved) {
    buildJustification = await buildHoursJustification({ projectId: id, stage: "BUILD" })
  }

  try {
    // Sync every approved stage so manual re-sync can backfill missing records
    if (designJustification !== undefined) {
      await syncProjectToAirtable(
        project.userId,
        project,
        designJustification,
        grantAmount,
        { approvedHours: designHours },
      )
    }
    if (buildJustification !== undefined) {
      await syncProjectToAirtable(
        project.userId,
        project,
        buildJustification,
        grantAmount,
        { buildOnly: true },
      )
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Failed to sync project to Airtable:", err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
