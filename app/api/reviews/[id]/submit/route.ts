import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission, hasRole, Role } from "@/lib/permissions"
import { sanitize } from "@/lib/sanitize"
import { logAdminAction, AuditAction } from "@/lib/audit"
import { getTierById, getTierBits, TIERS } from "@/lib/tiers"
import { appendLedgerEntry, CurrencyTransactionType } from "@/lib/currency"
import { sendSlackDM } from "@/lib/slack"
import { resolveSubmissionId } from "@/lib/resolve-submission"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const rawId = (await params).id
  const id = await resolveSubmissionId(rawId)
  if (!id) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 })
  }
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

  const submission = await prisma.projectSubmission.findUnique({
    where: { id },
    include: {
      project: {
        include: {
          user: { select: { id: true, name: true, slackId: true } },
          workSessions: true,
          bomItems: true,
        },
      },
      claim: true,
      reviews: { where: { invalidated: false } },
    },
  })

  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 })
  }

  // Check claim — must be claimed by this reviewer (or unclaimed)
  if (submission.claim) {
    const isExpired = new Date(submission.claim.expiresAt) <= new Date()
    if (!isExpired && submission.claim.reviewerId !== reviewerId) {
      return NextResponse.json(
        { error: "Submission is claimed by another reviewer" },
        { status: 409 }
      )
    }
  }

  // Non-admin cannot review pre-reviewed submissions
  if (!isAdmin && submission.preReviewed) {
    return NextResponse.json(
      { error: "This submission is awaiting admin review" },
      { status: 403 }
    )
  }

  const project = submission.project
  const sanitizedFeedback = sanitize(feedback.trim())
  const sanitizedReason = reason ? sanitize(reason.trim()) : null

  // Compute frozen snapshot
  const totalWorkUnits = project.workSessions.reduce((sum, s) => sum + s.hoursClaimed, 0)
  const entryCount = project.workSessions.length
  const bomCost = project.bomItems
    .filter((b) => b.status === "approved" || b.status === "pending")
    .reduce((sum, b) => sum + b.costPerItem * b.quantity, 0)

  const review = await prisma.$transaction(async (tx) => {
    // Create the review record
    const newReview = await tx.submissionReview.create({
      data: {
        submissionId: id,
        reviewerId,
        result,
        isAdminReview: isAdmin,
        feedback: sanitizedFeedback,
        reason: sanitizedReason,
        workUnitsOverride: workUnitsOverride ?? null,
        tierOverride: tierOverride ?? null,
        grantOverride: grantOverride ?? null,
        categoryOverride: categoryOverride ?? null,
        frozenWorkUnits: Math.round(totalWorkUnits * 10) / 10,
        frozenEntryCount: entryCount,
        frozenFundingAmount: Math.round(bomCost * 100),
        frozenTier: project.tier,
        frozenReviewerNote: submission.notes,
      },
    })

    // Handle result-specific logic
    if (result === "APPROVED") {
      if (isAdmin) {
        // Admin approval = finalize
        const stage = submission.stage.toLowerCase() as "design" | "build"
        const statusField = stage === "design" ? "designStatus" : "buildStatus"
        const commentsField = stage === "design" ? "designReviewComments" : "buildReviewComments"
        const reviewedAtField = stage === "design" ? "designReviewedAt" : "buildReviewedAt"
        const reviewedByField = stage === "design" ? "designReviewedBy" : "buildReviewedBy"

        const updateData: Record<string, unknown> = {
          [statusField]: "approved",
          [commentsField]: sanitizedFeedback,
          [reviewedAtField]: new Date(),
          [reviewedByField]: reviewerId,
        }

        // Apply tier override on design approval
        if (stage === "design" && tierOverride !== undefined && tierOverride !== null) {
          updateData.tier = tierOverride
        }

        // Build approval: award bits, approve sessions, grant badges
        if (stage === "build") {
          // Auto-approve pending build sessions
          const buildSessions = project.workSessions.filter(
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

          // Grant badges
          await tx.projectBadge.updateMany({
            where: { projectId: project.id, grantedAt: null },
            data: { grantedAt: new Date(), grantedBy: reviewerId },
          })

          // Award bits
          const effectiveTier = tierOverride ?? project.tier
          const tierBits = effectiveTier ? getTierBits(effectiveTier) : 0
          const designAction = await tx.projectReviewAction.findFirst({
            where: { projectId: project.id, stage: "DESIGN", decision: "APPROVED" },
            orderBy: { createdAt: "desc" },
            select: { grantAmount: true },
          })
          const bomDeduction = Math.round(designAction?.grantAmount ?? 0)
          const bitsAwarded = tierBits > 0 ? Math.max(0, tierBits - bomDeduction) : null

          if (bitsAwarded !== null && bitsAwarded > 0) {
            const tierName = getTierById(effectiveTier!)!.name
            await appendLedgerEntry(tx, {
              userId: project.userId,
              projectId: project.id,
              amount: bitsAwarded,
              type: CurrencyTransactionType.PROJECT_APPROVED,
              note: `Build approved — ${tierName} (${tierBits} − ${bomDeduction} BOM = ${bitsAwarded} bits)`,
              createdBy: reviewerId,
            })
          }

          // Additional grant
          if (grantOverride && grantOverride > 0) {
            await appendLedgerEntry(tx, {
              userId: project.userId,
              projectId: project.id,
              amount: grantOverride,
              type: CurrencyTransactionType.ADMIN_GRANT,
              note: `Additional grant on build approval (${grantOverride} bits)`,
              createdBy: reviewerId,
            })
          }

          updateData.bitsAwarded = bitsAwarded
        }

        // Approve BOM items on design approval
        if (stage === "design") {
          await tx.bOMItem.updateMany({
            where: { projectId: project.id, status: "pending" },
            data: { status: "approved", reviewedAt: new Date(), reviewedBy: reviewerId },
          })
        }

        await tx.project.update({ where: { id: project.id }, data: updateData })

        // Create legacy review action for compatibility
        await tx.projectReviewAction.create({
          data: {
            projectId: project.id,
            stage: submission.stage,
            decision: "APPROVED",
            comments: sanitizedFeedback,
            grantAmount: grantOverride ?? null,
            tier: tierOverride ?? null,
            reviewerId,
          },
        })
      } else {
        // Community reviewer approval = mark as pre-reviewed
        await tx.projectSubmission.update({
          where: { id },
          data: { preReviewed: true },
        })
      }
    } else if (result === "RETURNED" || result === "REJECTED") {
      // Invalidate all prior reviews on this submission
      await tx.submissionReview.updateMany({
        where: { submissionId: id, id: { not: newReview.id }, invalidated: false },
        data: { invalidated: true },
      })

      // Reset pre-reviewed status
      await tx.projectSubmission.update({
        where: { id },
        data: { preReviewed: false },
      })

      if (isAdmin || result === "REJECTED") {
        const stage = submission.stage.toLowerCase() as "design" | "build"
        const statusField = stage === "design" ? "designStatus" : "buildStatus"
        const commentsField = stage === "design" ? "designReviewComments" : "buildReviewComments"
        const reviewedAtField = stage === "design" ? "designReviewedAt" : "buildReviewedAt"
        const reviewedByField = stage === "design" ? "designReviewedBy" : "buildReviewedBy"

        const newStatus = result === "REJECTED" ? "rejected" : "update_requested"

        await tx.project.update({
          where: { id: project.id },
          data: {
            [statusField]: newStatus,
            [commentsField]: sanitizedFeedback,
            [reviewedAtField]: new Date(),
            [reviewedByField]: reviewerId,
          },
        })

        // Create legacy review action
        const legacyDecision = result === "REJECTED" ? "REJECTED" : "CHANGE_REQUESTED"
        await tx.projectReviewAction.create({
          data: {
            projectId: project.id,
            stage: submission.stage,
            decision: legacyDecision,
            comments: sanitizedFeedback,
            reviewerId,
          },
        })
      }
    }

    // Release claim
    if (submission.claim) {
      await tx.reviewClaim.delete({ where: { id: submission.claim.id } }).catch(() => {})
    }

    return newReview
  })

  // Audit log
  const auditAction = result === "APPROVED"
    ? AuditAction.REVIEWER_APPROVE
    : result === "RETURNED"
      ? AuditAction.REVIEWER_RETURN
      : AuditAction.REVIEWER_REJECT

  await logAdminAction(
    auditAction,
    reviewerId,
    authCheck.session.user.email ?? undefined,
    "ProjectSubmission",
    id,
    { result, isAdmin, feedback: sanitizedFeedback }
  )

  // Slack notification to submitter
  if (project.user.slackId && (isAdmin || result !== "APPROVED")) {
    const projectUrl = `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/dashboard/projects/${project.id}`
    const lines: string[] = []

    if (result === "APPROVED" && isAdmin) {
      lines.push(`Your *${project.title}* ${submission.stage.toLowerCase()} has been approved! :tada:`)
    } else if (result === "RETURNED") {
      lines.push(`Your *${project.title}* ${submission.stage.toLowerCase()} needs changes. :rotating_light:`)
    } else if (result === "REJECTED") {
      lines.push(`Your *${project.title}* ${submission.stage.toLowerCase()} has been permanently rejected.`)
    }

    if (sanitizedFeedback) lines.push(`\`\`\`${sanitizedFeedback}\`\`\``)
    lines.push(`<${projectUrl}|View project>`)

    sendSlackDM(project.user.slackId, lines.join("\n")).catch((err) =>
      console.error("Failed to send Slack DM for review:", err)
    )
  }

  return NextResponse.json(review)
}
