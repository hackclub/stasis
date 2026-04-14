import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { syncProjectToAirtable } from "@/lib/airtable"
import { getTierById } from "@/lib/tiers"

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
      bomItems: true,
      badges: true,
      user: { select: { name: true, email: true, slackId: true } },
    },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  // Build justification from review history
  const justLines: string[] = []
  const sessions = project.workSessions
  const designSessions = sessions.filter((s) => s.stage === "DESIGN")
  const buildSessions = sessions.filter((s) => s.stage === "BUILD")
  const designHours = designSessions.reduce((sum, s) => sum + s.hoursClaimed, 0)
  const buildHours = buildSessions.reduce((sum, s) => sum + s.hoursClaimed, 0)
  const tierInfo = project.tier ? getTierById(project.tier) : null
  const isBuildApproved = project.buildStatus === "approved"
  const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000"

  justLines.push(isBuildApproved ? `**Build Review**` : `**Design Review**`)
  justLines.push("")
  justLines.push(`Project: "${project.title}"`)
  justLines.push(`User: ${project.user.name || "Unknown"}`)
  if (tierInfo) justLines.push(`Tier: ${tierInfo.name} (${tierInfo.bits} bits, ${tierInfo.minHours}-${tierInfo.maxHours === Infinity ? "67+" : tierInfo.maxHours}h range)`)
  justLines.push("")

  // For each stage that's approved, show first-pass + second-pass reviews
  const stages: Array<{ stage: "DESIGN" | "BUILD"; label: string; hours: number; sessionCount: number }> = []
  if (project.designStatus === "approved") {
    stages.push({ stage: "DESIGN", label: "design", hours: designHours, sessionCount: designSessions.length })
  }
  if (isBuildApproved) {
    stages.push({ stage: "BUILD", label: "build", hours: buildHours, sessionCount: buildSessions.length })
  }

  for (const { stage, label, hours, sessionCount } of stages) {
    justLines.push(`This user logged ${hours.toFixed(1)} ${label} hours across ${sessionCount} journal entr${sessionCount === 1 ? "y" : "ies"}.`)
    justLines.push("")

    // First-pass review
    const latestSubmission = await prisma.projectSubmission.findFirst({
      where: { projectId: id, stage },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })
    if (latestSubmission) {
      const firstPass = await prisma.submissionReview.findFirst({
        where: { submissionId: latestSubmission.id, isAdminReview: false, result: "APPROVED" },
        orderBy: { createdAt: "desc" },
        select: { reviewerId: true, feedback: true, createdAt: true },
      })
      if (firstPass) {
        const fpUser = await prisma.user.findUnique({
          where: { id: firstPass.reviewerId },
          select: { name: true, email: true },
        })
        const fpName = fpUser?.name || fpUser?.email || "Unknown"
        const fpDate = firstPass.createdAt.toISOString().slice(0, 10)
        justLines.push(`--- First-pass ${label} review (${fpDate} by ${fpName}) ---`)
        if (firstPass.feedback) justLines.push(firstPass.feedback)
        justLines.push("")
      }
    }

    // Second-pass (admin) review
    const reviewAction = await prisma.projectReviewAction.findFirst({
      where: { projectId: id, stage, decision: "APPROVED" },
      orderBy: { createdAt: "desc" },
      select: { comments: true, createdAt: true, reviewerId: true, grantAmount: true },
    })
    if (reviewAction) {
      const reviewer = reviewAction.reviewerId
        ? await prisma.user.findUnique({ where: { id: reviewAction.reviewerId }, select: { name: true, email: true } })
        : null
      const reviewDate = reviewAction.createdAt.toISOString().slice(0, 10)
      justLines.push(`--- Second-pass ${label} review (${reviewDate} by ${reviewer?.name || reviewer?.email || "Unknown"}) ---`)
      if (reviewAction.comments) justLines.push(reviewAction.comments)
      justLines.push("")
    }
  }

  // BOM
  const approvedBom = project.bomItems.filter((b) => b.status === "approved" || b.status === "pending")
  const bomItemsCost = approvedBom.reduce((sum, b) => sum + b.totalCost, 0)
  const bomTax = project.bomTax ?? 0
  const bomShip = project.bomShipping ?? 0
  const bomTotal = bomItemsCost + bomTax + bomShip
  if (approvedBom.length > 0 || bomTax > 0 || bomShip > 0) {
    const costParts = [`$${bomItemsCost.toFixed(2)} parts`]
    if (bomTax > 0) costParts.push(`$${bomTax.toFixed(2)} tax`)
    if (bomShip > 0) costParts.push(`$${bomShip.toFixed(2)} shipping`)
    justLines.push(`BOM (${approvedBom.length} item${approvedBom.length === 1 ? "" : "s"}, ${costParts.join(" + ")} = $${bomTotal.toFixed(2)} total):`)
    for (const item of approvedBom) {
      const detail = item.quantity != null && item.quantity > 1
        ? `${item.quantity}x = $${item.totalCost.toFixed(2)}`
        : `$${item.totalCost.toFixed(2)}`
      justLines.push(`  - ${item.name}: ${detail}${item.status === "pending" ? " (pending)" : ""}`)
    }
    justLines.push("")
  }

  if (project.badges.length > 0) {
    justLines.push(`Badges: ${project.badges.map((b) => b.badge).join(", ")}`)
    justLines.push("")
  }
  if (project.githubRepo) justLines.push(`GitHub: ${project.githubRepo}`)
  if (project.description) justLines.push(`Description: ${project.description}`)
  justLines.push("")
  justLines.push(`The full journal for this project can be found at ${baseUrl}/dashboard/discover/${id}.`)

  // Get grant amount from design review action
  const designReviewAction = await prisma.projectReviewAction.findFirst({
    where: { projectId: id, stage: "DESIGN", decision: "APPROVED" },
    orderBy: { createdAt: "desc" },
    select: { grantAmount: true },
  })

  const justification = justLines.join("\n")
  const grantAmount = designReviewAction?.grantAmount ?? null

  try {
    // Sync every approved stage so manual re-sync can backfill missing records
    if (project.designStatus === "approved") {
      await syncProjectToAirtable(
        project.userId,
        project,
        justification,
        grantAmount,
        { approvedHours: designHours },
      )
    }
    if (isBuildApproved) {
      await syncProjectToAirtable(
        project.userId,
        project,
        justification,
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
