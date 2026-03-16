import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission, hasRole, Role } from "@/lib/permissions"
import { sanitize } from "@/lib/sanitize"
import { logAdminAction, AuditAction } from "@/lib/audit"
import { getTierById, getTierBits, TIERS } from "@/lib/tiers"
import { appendLedgerEntry, CurrencyTransactionType } from "@/lib/currency"
import { sendSlackDM } from "@/lib/slack"
import { syncProjectToAirtable } from "@/lib/airtable"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const { id: rawId } = await params
  const isAdmin = hasRole(authCheck.roles, Role.ADMIN)
  const reviewerId = authCheck.session.user.id
  const body = await request.json()

  const {
    result,
    feedback,
    reason,
    workUnitsOverride,
    tierOverride,
    grantOverride,
    categoryOverride,
  } = body

  // Validate result
  if (!["APPROVED", "RETURNED", "REJECTED"].includes(result)) {
    return NextResponse.json(
      { error: "result must be APPROVED, RETURNED, or REJECTED" },
      { status: 400 }
    )
  }

  // Feedback required
  if (!feedback || typeof feedback !== "string" || feedback.trim().length === 0) {
    return NextResponse.json(
      { error: "Feedback for submitter is required" },
      { status: 400 }
    )
  }

  // categoryOverride is admin-only
  if (categoryOverride && !isAdmin) {
    return NextResponse.json(
      { error: "Category override is admin-only" },
      { status: 403 }
    )
  }

  // Validate tierOverride
  if (tierOverride !== undefined && tierOverride !== null) {
    if (!TIERS.some((t) => t.id === tierOverride)) {
      return NextResponse.json(
        { error: `tierOverride must be one of ${TIERS.map((t) => t.id).join(", ")}` },
        { status: 400 }
      )
    }
  }

  // Resolve: rawId can be project ID or submission ID
  let project = await prisma.project.findUnique({
    where: { id: rawId },
    include: {
      user: { select: { id: true, name: true, slackId: true } },
      workSessions: true,
      bomItems: true,
      badges: true,
    },
  })

  let stage: "DESIGN" | "BUILD" | null = null

  if (!project) {
    // Try as submission ID
    const submission = await prisma.projectSubmission.findUnique({
      where: { id: rawId },
      select: { projectId: true, stage: true },
    })
    if (submission) {
      project = await prisma.project.findUnique({
        where: { id: submission.projectId },
        include: {
          user: { select: { id: true, name: true, slackId: true } },
          workSessions: true,
          bomItems: true,
          badges: true,
        },
      })
      stage = submission.stage as "DESIGN" | "BUILD"
    }
  }

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  // Block approving or returning fraud-convicted users' projects
  if (result !== "REJECTED") {
    const projectUser = await prisma.user.findUnique({
      where: { id: project.userId },
      select: { fraudConvicted: true },
    })
    if (projectUser?.fraudConvicted) {
      return NextResponse.json(
        { error: "Cannot approve or return projects from fraud-convicted users. Only rejection is allowed." },
        { status: 403 }
      )
    }
  }

  // Determine active stage if not from submission
  if (!stage) {
    const designInReview = project.designStatus === "in_review" || project.designStatus === "update_requested"
    const buildInReview = project.buildStatus === "in_review" || project.buildStatus === "update_requested"
    stage = buildInReview ? "BUILD" : designInReview ? "DESIGN" : null
  }

  if (!stage) {
    return NextResponse.json({ error: "Project is not in review" }, { status: 400 })
  }

  const sanitizedFeedback = sanitize(feedback.trim())
  const stageKey = stage.toLowerCase() as "design" | "build"

  // Map result to the existing decision format
  if (result === "APPROVED") {
    // Use the existing decision endpoint logic
    const decision = "approved"

    const updatedProject = await prisma.$transaction(async (tx) => {
      const statusField = stageKey === "design" ? "designStatus" : "buildStatus"
      const commentsField = stageKey === "design" ? "designReviewComments" : "buildReviewComments"
      const reviewedAtField = stageKey === "design" ? "designReviewedAt" : "buildReviewedAt"
      const reviewedByField = stageKey === "design" ? "designReviewedBy" : "buildReviewedBy"

      const updateData: Record<string, unknown> = {
        [statusField]: decision,
        [commentsField]: sanitizedFeedback,
        [reviewedAtField]: new Date(),
        [reviewedByField]: reviewerId,
      }

      // Apply tier override on design approval
      if (stageKey === "design" && tierOverride !== undefined && tierOverride !== null) {
        updateData.tier = tierOverride
      }

      // Design approval: approve BOM items
      if (stageKey === "design") {
        await tx.bOMItem.updateMany({
          where: { projectId: project!.id, status: "pending" },
          data: { status: "approved", reviewedAt: new Date(), reviewedBy: reviewerId },
        })
      }

      // Build approval: approve sessions, grant badges, award bits
      if (stageKey === "build") {
        const buildSessions = project!.workSessions.filter(
          (s) => s.stage === "BUILD" && s.hoursApproved === null
        )
        for (const session of buildSessions) {
          await tx.workSession.update({
            where: { id: session.id },
            data: {
              hoursApproved: workUnitsOverride ?? session.hoursClaimed,
              reviewedAt: new Date(),
              reviewedBy: reviewerId,
            },
          })
        }

        await tx.projectBadge.updateMany({
          where: { projectId: project!.id, grantedAt: null },
          data: { grantedAt: new Date(), grantedBy: reviewerId },
        })

        const effectiveTier = tierOverride ?? project!.tier
        const tierBits = effectiveTier ? getTierBits(effectiveTier) : 0
        const designAction = await tx.projectReviewAction.findFirst({
          where: { projectId: project!.id, stage: "DESIGN", decision: "APPROVED" },
          orderBy: { createdAt: "desc" },
          select: { grantAmount: true },
        })
        const bomDeduction = Math.round(designAction?.grantAmount ?? 0)
        const bitsAwarded = tierBits > 0 ? Math.max(0, tierBits - bomDeduction) : null

        if (bitsAwarded !== null && bitsAwarded > 0) {
          const tierName = getTierById(effectiveTier!)!.name
          await appendLedgerEntry(tx, {
            userId: project!.userId,
            projectId: project!.id,
            amount: bitsAwarded,
            type: CurrencyTransactionType.PROJECT_APPROVED,
            note: `Build approved — ${tierName} (${tierBits} − ${bomDeduction} BOM = ${bitsAwarded} bits)`,
            createdBy: reviewerId,
          })
        }

        if (grantOverride && grantOverride > 0) {
          await appendLedgerEntry(tx, {
            userId: project!.userId,
            projectId: project!.id,
            amount: grantOverride,
            type: CurrencyTransactionType.ADMIN_GRANT,
            note: `Additional grant on build approval (${grantOverride} bits)`,
            createdBy: reviewerId,
          })
        }

        updateData.bitsAwarded = bitsAwarded
      }

      // Create review action record
      await tx.projectReviewAction.create({
        data: {
          projectId: project!.id,
          stage,
          decision: "APPROVED",
          comments: sanitizedFeedback,
          grantAmount: grantOverride ?? null,
          tier: tierOverride ?? null,
          reviewerId,
        },
      })

      return tx.project.update({ where: { id: project!.id }, data: updateData })
    })

    await logAdminAction(
      AuditAction.REVIEWER_APPROVE,
      reviewerId,
      authCheck.session.user.email ?? undefined,
      "Project",
      project.id,
      { result, isAdmin, feedback: sanitizedFeedback }
    )

    // Slack notification
    if (project.user.slackId) {
      const projectUrl = `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/dashboard/projects/${project.id}`
      const lines = [`Your *${project.title}* ${stageKey} has been approved! :tada:`]
      if (sanitizedFeedback) lines.push(`\`\`\`${sanitizedFeedback}\`\`\``)
      lines.push(`<${projectUrl}|View project>`)
      sendSlackDM(project.user.slackId, lines.join("\n")).catch((err) =>
        console.error("Failed to send Slack DM:", err)
      )
    }

    // Sync to Airtable on approval
    {
      const approvedBom = project!.bomItems.filter((b) => b.status === "approved" || b.status === "pending")
      const bomCost = approvedBom.reduce((sum, b) => sum + b.costPerItem * b.quantity, 0)

      // Build hours justification with comprehensive project stats
      const sessions = project!.workSessions
      const designSessions = sessions.filter((s) => s.stage === "DESIGN")
      const buildSessions = sessions.filter((s) => s.stage === "BUILD")
      const designHours = designSessions.reduce((sum, s) => sum + s.hoursClaimed, 0)
      const buildHours = buildSessions.reduce((sum, s) => sum + s.hoursClaimed, 0)
      const totalHours = sessions.reduce((sum, s) => sum + s.hoursClaimed, 0)
      const entryCount = sessions.length

      const tierInfo = project!.tier ? getTierById(project!.tier) : null
      const badges = project!.badges
      const reviewerName = authCheck.session.user.name || "Unknown"
      const reviewerEmail = authCheck.session.user.email || "unknown"
      const dateStr = new Date().toISOString().slice(0, 10)
      const reasonText = typeof reason === "string" && reason.trim() ? reason.trim() : null

      const lines: string[] = []
      lines.push(`Project: "${project!.title}" (${stageKey} approval)`)
      lines.push(`User: ${project!.user.name || "Unknown"}`)
      if (tierInfo) lines.push(`Tier: ${tierInfo.name} (${tierInfo.bits} bits, ${tierInfo.minHours}-${tierInfo.maxHours === Infinity ? "67+" : tierInfo.maxHours}h range)`)
      lines.push("")
      lines.push(`This user logged ${totalHours.toFixed(1)} hours across ${entryCount} journal entr${entryCount === 1 ? "y" : "ies"}.`)
      if (designSessions.length > 0) lines.push(`  Design: ${designHours.toFixed(1)}h across ${designSessions.length} entr${designSessions.length === 1 ? "y" : "ies"}`)
      if (buildSessions.length > 0) lines.push(`  Build: ${buildHours.toFixed(1)}h across ${buildSessions.length} entr${buildSessions.length === 1 ? "y" : "ies"}`)
      lines.push("")
      if (approvedBom.length > 0) {
        lines.push(`BOM (${approvedBom.length} item${approvedBom.length === 1 ? "" : "s"}, $${bomCost.toFixed(2)} total):`)
        for (const item of approvedBom) {
          const itemTotal = item.costPerItem * item.quantity
          lines.push(`  - ${item.name}: ${item.quantity}x $${item.costPerItem.toFixed(2)} = $${itemTotal.toFixed(2)}${item.status === "pending" ? " (pending)" : ""}`)
        }
        lines.push("")
      } else {
        lines.push(`BOM: None${project!.noBomNeeded ? " (marked as no BOM needed)" : ""}`)
        lines.push("")
      }
      if (badges.length > 0) {
        lines.push(`Badges: ${badges.map((b) => b.badge).join(", ")}`)
        lines.push("")
      }
      if (project!.githubRepo) lines.push(`GitHub: ${project!.githubRepo}`)
      if (project!.description) lines.push(`Description: ${project!.description}`)
      lines.push("")
      lines.push(`On ${dateStr}, ${reviewerName} (${reviewerEmail}) decided "approved"${reasonText ? ` with reason: ${reasonText}` : "."}`)

      const hoursJustification = lines.join("\n")

      try {
        await syncProjectToAirtable(project!.userId, project!, hoursJustification, grantOverride ?? bomCost)
      } catch (err) {
        console.error(`Failed to sync project to Airtable on ${stageKey} approval:`, err)
      }
    }

    return NextResponse.json(updatedProject)
  } else {
    // RETURNED or REJECTED
    const newStatus = result === "REJECTED" ? "rejected" : "update_requested"
    const legacyDecision = result === "REJECTED" ? "REJECTED" : "CHANGE_REQUESTED"

    const statusField = stageKey === "design" ? "designStatus" : "buildStatus"
    const commentsField = stageKey === "design" ? "designReviewComments" : "buildReviewComments"
    const reviewedAtField = stageKey === "design" ? "designReviewedAt" : "buildReviewedAt"
    const reviewedByField = stageKey === "design" ? "designReviewedBy" : "buildReviewedBy"

    const updatedProject = await prisma.$transaction(async (tx) => {
      await tx.projectReviewAction.create({
        data: {
          projectId: project!.id,
          stage,
          decision: legacyDecision,
          comments: sanitizedFeedback,
          reviewerId,
        },
      })

      return tx.project.update({
        where: { id: project!.id },
        data: {
          [statusField]: newStatus,
          [commentsField]: sanitizedFeedback,
          [reviewedAtField]: new Date(),
          [reviewedByField]: reviewerId,
        },
      })
    })

    const auditAction = result === "REJECTED" ? AuditAction.REVIEWER_REJECT : AuditAction.REVIEWER_RETURN
    await logAdminAction(
      auditAction,
      reviewerId,
      authCheck.session.user.email ?? undefined,
      "Project",
      project.id,
      { result, isAdmin, feedback: sanitizedFeedback }
    )

    // Slack notification
    if (project.user.slackId) {
      const projectUrl = `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/dashboard/projects/${project.id}`
      const msg = result === "REJECTED"
        ? `Your *${project.title}* ${stageKey} has been permanently rejected.`
        : `Your *${project.title}* ${stageKey} needs changes. :rotating_light:`
      const lines = [msg]
      if (sanitizedFeedback) lines.push(`\`\`\`${sanitizedFeedback}\`\`\``)
      lines.push(`<${projectUrl}|View project>`)
      sendSlackDM(project.user.slackId, lines.join("\n")).catch((err) =>
        console.error("Failed to send Slack DM:", err)
      )
    }

    return NextResponse.json(updatedProject)
  }
}
