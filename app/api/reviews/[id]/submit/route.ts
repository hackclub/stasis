import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { Prisma } from "@/app/generated/prisma/client"
import { requirePermission } from "@/lib/admin-auth"
import { Permission, hasRole, Role } from "@/lib/permissions"
import { sanitize } from "@/lib/sanitize"
import { logAdminAction, AuditAction } from "@/lib/audit"
import { getTierById, getTierBits, TIERS } from "@/lib/tiers"
import { appendLedgerEntry, CurrencyTransactionType } from "@/lib/currency"
import { sendSlackDM } from "@/lib/slack"
import { syncProjectToAirtable } from "@/lib/airtable"
import { totalBomCost } from "@/lib/format"

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
    submissionId: clientSubmissionId,
    firstPassReviewerId,
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

  // Internal justification required for admin (second-pass) approvals only
  if (result === "APPROVED" && isAdmin && (!reason || typeof reason !== "string" || reason.trim().length === 0)) {
    return NextResponse.json(
      { error: "Internal justification is required" },
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

  if (!project || project.deletedAt) {
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
    const designInReview = project.designStatus === "in_review"
    const buildInReview = project.buildStatus === "in_review"
    stage = buildInReview ? "BUILD" : designInReview ? "DESIGN" : null
  }

  if (!stage) {
    return NextResponse.json({ error: "Project is not in review" }, { status: 400 })
  }

  // Always validate that the project is still in review for the determined stage,
  // even when stage was derived from a submission ID (prevents reviewing
  // already-approved/rejected projects via stale submission links)
  const currentStatus = stage === "DESIGN" ? project.designStatus : project.buildStatus
  if (currentStatus !== "in_review") {
    return NextResponse.json(
      { error: `Project ${stage.toLowerCase()} is no longer in review (status: ${currentStatus})` },
      { status: 400 }
    )
  }

  // Verify the submission the reviewer saw still exists (guards against
  // unsubmit-resubmit race: user withdraws and resubmits while reviewer
  // has a stale page open)
  if (clientSubmissionId && typeof clientSubmissionId === "string") {
    const submissionStillExists = await prisma.projectSubmission.findUnique({
      where: { id: clientSubmissionId },
      select: { id: true },
    })
    if (!submissionStillExists) {
      return NextResponse.json(
        { error: "This submission has been withdrawn. Please refresh the page and review the latest submission." },
        { status: 409 }
      )
    }
  }

  const sanitizedFeedback = sanitize(feedback.trim())
  const stageKey = stage.toLowerCase() as "design" | "build"

  // For design approvals, default grant to BOM cost if not explicitly overridden
  const bomCostTotal = totalBomCost(project.bomItems, project.bomTax, project.bomShipping)
  const effectiveGrant = grantOverride ?? (stageKey === "design" ? (bomCostTotal > 0 ? Math.ceil(bomCostTotal + 3) : 0) : null)

  // Map result to the existing decision format
  if (result === "APPROVED") {
    // Non-admin reviewers do a first-pass review only — no status change,
    // no bits, no Airtable sync.  The project stays in review and gets
    // surfaced to admins at the top of the queue.
    if (!isAdmin) {
      const updatedSubmission = await prisma.$transaction(async (tx) => {
        // Find the active submission for this project+stage
        const submission = await tx.projectSubmission.findFirst({
          where: { projectId: project!.id, stage },
          orderBy: { createdAt: "desc" },
        })

        if (submission) {
          await tx.projectSubmission.update({
            where: { id: submission.id },
            data: { preReviewed: true },
          })

          // Create a SubmissionReview record so admins can see the first-pass details
          await tx.submissionReview.create({
            data: {
              submissionId: submission.id,
              reviewerId,
              result: "APPROVED",
              isAdminReview: false,
              feedback: sanitizedFeedback,
              workUnitsOverride: workUnitsOverride ?? null,
              tierOverride: tierOverride ?? null,
              grantOverride: effectiveGrant ?? null,
            },
          })
        }

        return submission
      })

      await logAdminAction(
        AuditAction.REVIEWER_APPROVE,
        reviewerId,
        authCheck.session.user.email ?? undefined,
        "Project",
        project.id,
        { result, isAdmin: false, firstPass: true, feedback: sanitizedFeedback }
      )

      return NextResponse.json({
        firstPassReview: true,
        message: "First-pass review recorded. An admin will finalize.",
        submissionId: updatedSubmission?.id,
      })
    }

    // ── Admin full approval ──
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

      // Design approval: approve BOM items + award pending bits
      if (stageKey === "design") {
        await tx.bOMItem.updateMany({
          where: { projectId: project!.id, status: "pending" },
          data: { status: "approved", reviewedAt: new Date(), reviewedBy: reviewerId },
        })

        // Cancel any existing pending bits before awarding new ones (handles re-approvals)
        const existingPending = await tx.currencyTransaction.aggregate({
          where: { userId: project!.userId, projectId: project!.id, type: "DESIGN_APPROVED" },
          _sum: { amount: true },
        })
        const pendingToCancel = existingPending._sum.amount ?? 0
        if (pendingToCancel !== 0) {
          await appendLedgerEntry(tx, {
            userId: project!.userId,
            projectId: project!.id,
            amount: -pendingToCancel,
            type: CurrencyTransactionType.DESIGN_APPROVED,
            note: `Pending bits reset — design re-approved`,
            createdBy: reviewerId,
          })
        }

        // Award pending bits (DESIGN_APPROVED) based on tier minus BOM cost
        const effectiveTierDesign = tierOverride ?? project!.tier
        const tierBitsDesign = effectiveTierDesign ? getTierBits(effectiveTierDesign) : 0
        const bomCostDesign = Math.round(effectiveGrant ?? 0)
        const pendingBits = tierBitsDesign > 0 ? Math.max(0, tierBitsDesign - bomCostDesign) : 0

        if (pendingBits > 0) {
          const tierNameDesign = getTierById(effectiveTierDesign!)!.name
          await appendLedgerEntry(tx, {
            userId: project!.userId,
            projectId: project!.id,
            amount: pendingBits,
            type: CurrencyTransactionType.DESIGN_APPROVED,
            note: `Design approved — ${tierNameDesign} (${tierBitsDesign} − ${bomCostDesign} BOM = ${pendingBits} pending bits)`,
            createdBy: reviewerId,
          })
        }
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
              hoursApproved: session.hoursClaimed,
              reviewedAt: new Date(),
              reviewedBy: reviewerId,
            },
          })
        }

        await tx.projectBadge.updateMany({
          where: { projectId: project!.id, grantedAt: null },
          data: { grantedAt: new Date(), grantedBy: reviewerId },
        })

        // Cancel pending bits (DESIGN_APPROVED) before awarding confirmed bits
        const pendingSum = await tx.currencyTransaction.aggregate({
          where: { userId: project!.userId, projectId: project!.id, type: "DESIGN_APPROVED" },
          _sum: { amount: true },
        })
        const pendingToCancel = pendingSum._sum.amount ?? 0
        if (pendingToCancel !== 0) {
          await appendLedgerEntry(tx, {
            userId: project!.userId,
            projectId: project!.id,
            amount: -pendingToCancel,
            type: CurrencyTransactionType.DESIGN_APPROVED,
            note: `Pending bits converted — build approved`,
            createdBy: reviewerId,
          })
        }

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

        if (effectiveGrant && effectiveGrant > 0) {
          await appendLedgerEntry(tx, {
            userId: project!.userId,
            projectId: project!.id,
            amount: effectiveGrant,
            type: CurrencyTransactionType.ADMIN_GRANT,
            note: `Additional grant on build approval (${effectiveGrant} bits)`,
            createdBy: reviewerId,
          })
        }

        updateData.bitsAwarded = bitsAwarded
      }

      // Create review action record — attribute to the original first-pass
      // reviewer when the admin is sending their review as-is
      const timelineReviewerId = (typeof firstPassReviewerId === "string" && firstPassReviewerId)
        ? firstPassReviewerId
        : reviewerId
      await tx.projectReviewAction.create({
        data: {
          projectId: project!.id,
          stage,
          decision: "APPROVED",
          comments: sanitizedFeedback,
          grantAmount: effectiveGrant ?? null,
          tier: tierOverride ?? null,
          reviewerId: timelineReviewerId,
        },
      })

      return tx.project.update({ where: { id: project!.id }, data: updateData })
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
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
      const isBuildApproval = stageKey === "build"
      const tierInfo = project!.tier ? getTierById(project!.tier) : null
      const reviewerName = authCheck.session.user.name || "Unknown"
      const reviewerEmail = authCheck.session.user.email || "unknown"
      const dateStr = new Date().toISOString().slice(0, 10)
      const reasonText = typeof reason === "string" && reason.trim() ? reason.trim() : null
      const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000"

      const sessions = project!.workSessions
      const relevantSessions = isBuildApproval
        ? sessions.filter((s) => s.stage === "BUILD")
        : sessions
      const journalHours = relevantSessions.reduce((sum, s) => sum + s.hoursClaimed, 0)
      const journalCount = relevantSessions.length

      // Fetch hackatime hours
      const hackatimeProjects = await prisma.hackatimeProject.findMany({
        where: { projectId: project!.id },
      })
      let hackatimeHours = 0
      const hackatimeUser = await prisma.user.findUnique({
        where: { id: project!.userId },
        select: { hackatimeUserId: true },
      })
      if (hackatimeProjects.length > 0 && hackatimeUser?.hackatimeUserId) {
        const { fetchHackatimeProjectSeconds } = await import("@/lib/hackatime")
        for (const hp of hackatimeProjects) {
          if (hp.hoursApproved !== null) {
            hackatimeHours += hp.hoursApproved
          } else {
            const secs = await fetchHackatimeProjectSeconds(hackatimeUser.hackatimeUserId, hp.hackatimeProject)
            hackatimeHours += secs / 3600
          }
        }
      }
      hackatimeHours = Math.round(hackatimeHours * 10) / 10

      // Fetch timelapse hours from session timelapses
      const sessionIds = relevantSessions.map((s) => s.id)
      const timelapses = sessionIds.length > 0
        ? await prisma.sessionTimelapse.findMany({
            where: { workSessionId: { in: sessionIds } },
            select: { duration: true },
          })
        : []
      const timelapseHours = Math.round(timelapses.reduce((sum, t) => sum + (t.duration ?? 0), 0) / 3600 * 10) / 10

      // Build the hours description parts
      const hoursParts: string[] = []
      hoursParts.push(`${journalHours.toFixed(1)} hours across ${journalCount} journal entr${journalCount === 1 ? "y" : "ies"}`)
      if (hackatimeHours > 0) hoursParts.push(`${hackatimeHours} hours of hackatime`)
      if (timelapseHours > 0) hoursParts.push(`${timelapseHours} hours of lapse`)

      // Fetch first-pass reviewer name if one exists
      const latestSubmission = await prisma.projectSubmission.findFirst({
        where: { projectId: project!.id, stage: stage! },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      })
      const lines: string[] = []

      lines.push(isBuildApproval ? `**Build Review**` : `**Design Review**`)
      lines.push("")
      if (tierInfo) lines.push(`Tier: ${tierInfo.name} (${tierInfo.bits} bits, ${tierInfo.minHours}-${tierInfo.maxHours === Infinity ? "67+" : tierInfo.maxHours}h range)`)
      lines.push(`This user logged ${hoursParts.join(", ")}.`)
      if (workUnitsOverride != null && workUnitsOverride !== journalHours) {
        lines.push(`Reviewer overrode hours to ${workUnitsOverride}h (claimed ${journalHours.toFixed(1)}h → approved ${workUnitsOverride}h)`)
      }
      lines.push("")

      lines.push(`Part of the time for this project was tracked via journaling. After making sure the project worked, and was shipped, the second pass reviewer decided the deflation.`)
      lines.push("")

      // First-pass review
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
          lines.push(`--- First-pass review (${fpDate} by ${fpName}) ---`)
          if (firstPass.feedback) lines.push(firstPass.feedback)
          lines.push("")
        }
      }

      // Second-pass (admin) review
      lines.push(`--- Second-pass review (${dateStr} by ${reviewerName}) ---`)
      if (reasonText) lines.push(reasonText)
      lines.push("")
      lines.push(`The full journal for this project can be found at ${baseUrl}/dashboard/discover/${project!.id}.`)

      const hoursJustification = lines.join("\n")

      try {
        const approvedBom = project!.bomItems.filter((b) => b.status === "approved" || b.status === "pending")
        const bomItemsCost = approvedBom.reduce((sum, b) => sum + b.totalCost, 0)
        const bomTax = project!.bomTax ?? 0
        const bomShip = project!.bomShipping ?? 0
        const bomCost = bomItemsCost + bomTax + bomShip

        const syncOptions: { buildOnly?: boolean; approvedHours?: number } = {}
        if (isBuildApproval) syncOptions.buildOnly = true
        if (workUnitsOverride != null) syncOptions.approvedHours = workUnitsOverride
        await syncProjectToAirtable(project!.userId, project!, hoursJustification, effectiveGrant ?? bomCost, syncOptions)
      } catch (err) {
        console.error(`Failed to sync project to Airtable on ${stageKey} approval:`, err)
      }
    }

    return NextResponse.json(updatedProject)
  } else {
    // RETURNED or REJECTED
    const legacyDecision = result === "REJECTED" ? "REJECTED" : "CHANGE_REQUESTED"

    const newStatus = result === "REJECTED" ? "rejected" : "update_requested"

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

      // Cancel pending bits on build rejection
      if (stageKey === "build" && result === "REJECTED") {
        const pendingSum = await tx.currencyTransaction.aggregate({
          where: { userId: project!.userId, projectId: project!.id, type: "DESIGN_APPROVED" },
          _sum: { amount: true },
        })
        const pendingToCancel = pendingSum._sum.amount ?? 0
        if (pendingToCancel !== 0) {
          await appendLedgerEntry(tx, {
            userId: project!.userId,
            projectId: project!.id,
            amount: -pendingToCancel,
            type: CurrencyTransactionType.DESIGN_APPROVED,
            note: `Pending bits cancelled — build rejected`,
            createdBy: reviewerId,
          })
        }
      }

      return tx.project.update({
        where: { id: project!.id },
        data: {
          [statusField]: newStatus,
          [commentsField]: sanitizedFeedback,
          [reviewedAtField]: new Date(),
          [reviewedByField]: reviewerId,
        },
      })
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
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
