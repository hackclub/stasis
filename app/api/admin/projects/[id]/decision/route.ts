import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { Prisma } from "@/app/generated/prisma/client"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
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

  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      workSessions: true,
      bomItems: true,
    },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const body = await request.json()
  const { stage, decision, reviewComments, grantAmount, tier, hoursJustification, airtableGrantAmount } = body

  if (stage !== "design" && stage !== "build") {
    return NextResponse.json(
      { error: "stage must be 'design' or 'build'" },
      { status: 400 }
    )
  }

  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json(
      { error: "decision must be 'approved' or 'rejected'" },
      { status: 400 }
    )
  }

  const adminUserId = authCheck.session.user.id
  const now = new Date()
  const sanitizedComments = typeof reviewComments === "string" ? sanitize(reviewComments) : null

  // grantAmount: additional bits, only applicable to build stage approvals
  if (grantAmount !== undefined && grantAmount !== null) {
    if (typeof grantAmount !== "number" || !Number.isInteger(grantAmount) || grantAmount < 0 || grantAmount > 10000) {
      return NextResponse.json(
        { error: "grantAmount must be a non-negative integer no greater than 10 000" },
        { status: 400 }
      )
    }
  }
  // For design approvals, default grant to BOM cost if not explicitly provided
  const bomCostTotal = totalBomCost(project.bomItems, project.bomTax, project.bomShipping)
  const parsedGrantAmount = typeof grantAmount === "number" && grantAmount > 0
    ? grantAmount
    : (stage === "design" && decision === "approved" ? Math.round(bomCostTotal * 100) / 100 || null : null)

  // tier: set at design approval to lock in the bit grant for build completion
  let parsedTier: number | null | undefined = undefined
  if (stage === "design") {
    if (tier === null || tier === undefined) {
      parsedTier = null
    } else if (typeof tier === "number" && Number.isInteger(tier) && TIERS.some(t => t.id === tier)) {
      parsedTier = tier
    } else {
      return NextResponse.json(
        { error: `tier must be ${TIERS.map(t => t.id).join(', ')}` },
        { status: 400 }
      )
    }
  }

  if (stage === "design") {
    // Design stage review
    if (project.designStatus !== "in_review") {
      return NextResponse.json(
        { error: "Design is not pending review" },
        { status: 400 }
      )
    }

    const reviewDecision = decision === "approved" ? "APPROVED" : "REJECTED"
    
    const updatedProject = await prisma.$transaction(async (tx) => {
      // If approving design, also approve pending BOM items
      if (decision === "approved") {
        await tx.bOMItem.updateMany({
          where: { projectId: id, status: "pending" },
          data: {
            status: "approved",
            reviewedAt: now,
            reviewedBy: adminUserId,
          },
        })
      }

      // Award pending bits (DESIGN_APPROVED) based on tier minus BOM cost
      if (decision === "approved") {
        const effectiveTierDesign = (parsedTier !== undefined ? parsedTier : project.tier)
        const tierBitsDesign = effectiveTierDesign ? getTierBits(effectiveTierDesign) : 0
        const bomCostDesign = Math.round(parsedGrantAmount ?? 0)
        const pendingBits = tierBitsDesign > 0 ? Math.max(0, tierBitsDesign - bomCostDesign) : 0

        if (pendingBits > 0) {
          const tierNameDesign = getTierById(effectiveTierDesign!)!.name
          await appendLedgerEntry(tx, {
            userId: project.userId,
            projectId: id,
            amount: pendingBits,
            type: CurrencyTransactionType.DESIGN_APPROVED,
            note: `Design approved — ${tierNameDesign} (${tierBitsDesign} − ${bomCostDesign} BOM = ${pendingBits} pending bits)`,
            createdBy: adminUserId,
          })
        }
      }

      // Create review action record
      await tx.projectReviewAction.create({
        data: {
          projectId: id,
          stage: "DESIGN",
          decision: reviewDecision,
          comments: sanitizedComments,
          grantAmount: parsedGrantAmount,
          tier: decision === "approved" && parsedTier !== undefined ? parsedTier : null,
          tierBefore: decision === "approved" ? project.tier ?? null : null,
          reviewerId: adminUserId,
        },
      })

      // Update project status (and lock in tier on approval)
      return tx.project.update({
        where: { id },
        data: {
          designStatus: decision,
          designReviewComments: sanitizedComments,
          designReviewedAt: now,
          designReviewedBy: adminUserId,
          ...(decision === "approved" && parsedTier !== undefined ? { tier: parsedTier } : {}),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              slackId: true,
            },
          },
          workSessions: {
            include: { media: true },
            orderBy: { createdAt: "desc" },
          },
          badges: true,
          bomItems: true,
        },
      })
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })

    await logAdminAction(
      decision === "approved" ? AuditAction.ADMIN_APPROVE_DESIGN : AuditAction.ADMIN_REJECT_DESIGN,
      authCheck.session.user.id,
      authCheck.session.user.email ?? undefined,
      "Project",
      id,
      { decision, grantAmount: parsedGrantAmount, comments: sanitizedComments }
    )

    if (updatedProject.user.slackId) {
      const projectUrl = `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/dashboard/projects/${id}`
      const lines: string[] = []
      if (decision === "approved") {
        lines.push(`Your *${updatedProject.title}* design has been approved! 🎉`)
        const designHours = project.workSessions
          .filter((s) => s.stage === "DESIGN")
          .reduce((sum, s) => sum + s.hoursClaimed, 0)
        if (designHours > 0) lines.push(`Hours approved: *${designHours}h*`)
        if (parsedTier !== undefined && parsedTier !== null) {
          const tierInfo = getTierById(parsedTier)
          const oldTierInfo = project.tier !== null ? getTierById(project.tier) : null
          if (tierInfo && oldTierInfo && project.tier !== parsedTier) {
            lines.push(`⚠️ Tier changed: ${oldTierInfo.name} (${oldTierInfo.bits} bits) → *${tierInfo.name}* (${tierInfo.bits} bits)`)
          } else if (tierInfo) {
            lines.push(`Tier: *${tierInfo.name}* (${tierInfo.bits} bits)`)
          }
        }
        if (parsedGrantAmount) lines.push(`BOM grant: *$${parsedGrantAmount}*`)
        if (sanitizedComments) lines.push(`\`\`\`${sanitizedComments}\`\`\``)
        lines.push(`<${projectUrl}|View project>`)
      } else {
        lines.push(`Your design for *${updatedProject.title}* needs changes to be approved. :rotating_light:`)
        if (sanitizedComments) lines.push(`\`\`\`${sanitizedComments}\`\`\``)
        lines.push(`<${projectUrl}|View project>`)
      }
      sendSlackDM(updatedProject.user.slackId, lines.join("\n")).catch((err) =>
        console.error("Failed to send Slack DM for design review:", err)
      )
    }

    return NextResponse.json(updatedProject)
  } else {
    // Build stage review
    if (project.designStatus !== "approved") {
      return NextResponse.json(
        { error: "Design must be approved before reviewing build" },
        { status: 400 }
      )
    }

    if (project.buildStatus !== "in_review") {
      return NextResponse.json(
        { error: "Build is not pending review" },
        { status: 400 }
      )
    }

    const buildReviewDecision = decision === "approved" ? "APPROVED" : "REJECTED"
    
    // Use a transaction for build approval to ensure atomicity
    if (decision === "approved") {
      const buildSessionsToApprove = project.workSessions.filter(
        (s) => s.stage === "BUILD" && s.hoursApproved === null
      )

      const updatedProject = await prisma.$transaction(async (tx) => {
        // Auto-approve pending BUILD work sessions

        for (const session of buildSessionsToApprove) {
          await tx.workSession.update({
            where: { id: session.id },
            data: {
              hoursApproved: session.hoursClaimed,
              reviewedAt: now,
              reviewedBy: adminUserId,
            },
          })
        }

        // Grant badges on build approval
        await tx.projectBadge.updateMany({
          where: { projectId: id, grantedAt: null },
          data: {
            grantedAt: now,
            grantedBy: adminUserId,
          },
        })

        // Create review action record
        await tx.projectReviewAction.create({
          data: {
            projectId: id,
            stage: "BUILD",
            decision: buildReviewDecision,
            comments: sanitizedComments,
            grantAmount: parsedGrantAmount,
            reviewerId: adminUserId,
          },
        })

        // Cancel pending bits (DESIGN_APPROVED) before awarding confirmed bits
        const pendingSum = await tx.currencyTransaction.aggregate({
          where: { userId: project.userId, projectId: id, type: "DESIGN_APPROVED" },
          _sum: { amount: true },
        })
        const pendingToCancel = pendingSum._sum.amount ?? 0
        if (pendingToCancel !== 0) {
          await appendLedgerEntry(tx, {
            userId: project.userId,
            projectId: id,
            amount: -pendingToCancel,
            type: CurrencyTransactionType.DESIGN_APPROVED,
            note: `Pending bits converted — build approved`,
            createdBy: adminUserId,
          })
        }

        // Award bits based on the project's tier (locked in at design approval),
        // minus the approved BOM grant set during design review
        const tierBits = project.tier ? getTierBits(project.tier) : 0
        const designAction = await tx.projectReviewAction.findFirst({
          where: { projectId: id, stage: "DESIGN", decision: "APPROVED" },
          orderBy: { createdAt: "desc" },
          select: { grantAmount: true },
        })
        const bomDeduction = Math.round(designAction?.grantAmount ?? 0)
        const bitsAwarded = tierBits > 0 ? Math.max(0, tierBits - bomDeduction) : null

        // Write ledger entry atomically with the project update
        if (bitsAwarded !== null && bitsAwarded > 0) {
          const tierName = getTierById(project.tier!)!.name
          await appendLedgerEntry(tx, {
            userId: project.userId,
            projectId: id,
            amount: bitsAwarded,
            type: CurrencyTransactionType.PROJECT_APPROVED,
            note: `Build approved — ${tierName} (${tierBits} − ${bomDeduction} BOM = ${bitsAwarded} bits)`,
            createdBy: adminUserId,
          })
        }

        // If reviewer specified an additional grant, credit that too
        if (parsedGrantAmount !== null && parsedGrantAmount > 0) {
          await appendLedgerEntry(tx, {
            userId: project.userId,
            projectId: id,
            amount: parsedGrantAmount,
            type: CurrencyTransactionType.ADMIN_GRANT,
            note: `Additional grant on build approval (${parsedGrantAmount} bits)`,
            createdBy: adminUserId,
          })
        }

        // Update project build status
        return tx.project.update({
          where: { id },
          data: {
            buildStatus: decision,
            buildReviewComments: sanitizedComments,
            buildReviewedAt: now,
            buildReviewedBy: adminUserId,
            bitsAwarded,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                slackId: true,
              },
            },
            workSessions: {
              include: { media: true },
              orderBy: { createdAt: "desc" },
            },
            badges: true,
            bomItems: true,
          },
        })
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })

      await logAdminAction(
        AuditAction.ADMIN_APPROVE_BUILD,
        authCheck.session.user.id,
        authCheck.session.user.email ?? undefined,
        "Project",
        id,
        { decision, grantAmount: parsedGrantAmount, comments: sanitizedComments }
      )

      if (updatedProject.user.slackId) {
        const projectUrl = `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/dashboard/projects/${id}`
        const lines: string[] = [`Your *${updatedProject.title}* build has been approved! 🎉`]
        const buildHours = buildSessionsToApprove.reduce((sum, s) => sum + s.hoursClaimed, 0)
        if (buildHours > 0) lines.push(`Hours approved: *${buildHours}h*`)
        if (updatedProject.bitsAwarded) lines.push(`You earned *${updatedProject.bitsAwarded} bits*!`)
        if (parsedGrantAmount) lines.push(`Additional grant: *${parsedGrantAmount} bits*`)
        if (sanitizedComments) lines.push(`\`\`\`${sanitizedComments}\`\`\``)
        lines.push(`<${projectUrl}|View project>`)
        sendSlackDM(updatedProject.user.slackId, lines.join("\n")).catch((err) =>
          console.error("Failed to send Slack DM for build approval:", err)
        )
      }

      // Sync to Airtable on build approval (full data now available)
      {
        const parsedAirtableGrantAmount = typeof airtableGrantAmount === "number" && airtableGrantAmount >= 0 ? airtableGrantAmount : null

        // Construct build review justification with design review context
        const sessions = project.workSessions
        const designSessions = sessions.filter((s) => s.stage === "DESIGN")
        const buildSessions = sessions.filter((s) => s.stage === "BUILD")
        const designHours = designSessions.reduce((sum, s) => sum + s.hoursClaimed, 0)
        const buildHours = buildSessions.reduce((sum, s) => sum + s.hoursClaimed, 0)
        const tierInfo = project.tier ? getTierById(project.tier) : null
        const adminName = authCheck.session.user.name || "Unknown"
        const adminEmail = authCheck.session.user.email || "unknown"
        const dateStr = new Date().toISOString().slice(0, 10)

        const justLines: string[] = []
        justLines.push(`**Build Review**`)
        justLines.push("")

        // Include design review justification
        const designReviewAction = await prisma.projectReviewAction.findFirst({
          where: { projectId: id, stage: "DESIGN", decision: "APPROVED" },
          orderBy: { createdAt: "desc" },
          select: { comments: true, createdAt: true, reviewerId: true },
        })
        if (designReviewAction) {
          const designReviewer = designReviewAction.reviewerId
            ? await prisma.user.findUnique({ where: { id: designReviewAction.reviewerId }, select: { name: true, email: true } })
            : null
          const designDate = designReviewAction.createdAt.toISOString().slice(0, 10)
          justLines.push(`--- Design Review (approved ${designDate} by ${designReviewer?.name || designReviewer?.email || "Unknown"}) ---`)
          if (designReviewAction.comments) justLines.push(designReviewAction.comments)
          justLines.push(`  Design hours: ${designHours.toFixed(1)}h across ${designSessions.length} entr${designSessions.length === 1 ? "y" : "ies"}`)
          justLines.push("")
          justLines.push(`--- Build Review ---`)
        }

        justLines.push(`Project: "${updatedProject.title}" (build approval)`)
        justLines.push(`User: ${updatedProject.user.name || "Unknown"}`)
        if (tierInfo) justLines.push(`Tier: ${tierInfo.name} (${tierInfo.bits} bits, ${tierInfo.minHours}-${tierInfo.maxHours === Infinity ? "67+" : tierInfo.maxHours}h range)`)
        justLines.push("")
        justLines.push(`This user logged ${buildHours.toFixed(1)} build hours across ${buildSessions.length} journal entr${buildSessions.length === 1 ? "y" : "ies"}.`)
        justLines.push("")

        const approvedBom = updatedProject.bomItems.filter((b: { status: string }) => b.status === "approved" || b.status === "pending")
        const bomItemsCost = approvedBom.reduce((sum: number, b: { totalCost: number }) => sum + b.totalCost, 0)
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

        if (updatedProject.badges.length > 0) {
          justLines.push(`Badges: ${updatedProject.badges.map((b: { badge: string }) => b.badge).join(", ")}`)
          justLines.push("")
        }
        if (project.githubRepo) justLines.push(`GitHub: ${project.githubRepo}`)
        if (project.description) justLines.push(`Description: ${project.description}`)
        justLines.push("")
        justLines.push(`On ${dateStr}, ${adminName} (${adminEmail}) decided "approved"${sanitizedComments ? ` with reason: ${sanitizedComments}` : "."}`)

        const buildJustification = justLines.join("\n")

        try {
          await syncProjectToAirtable(project.userId, project, buildJustification, parsedAirtableGrantAmount, { buildOnly: true })
        } catch (err) {
          console.error("Failed to sync project to Airtable on build approval:", err)
        }
      }

      return NextResponse.json(updatedProject)
    } else {
      // Rejection
      const updatedProject = await prisma.$transaction(async (tx) => {
        // Cancel pending bits on build rejection
        const pendingSum = await tx.currencyTransaction.aggregate({
          where: { userId: project.userId, projectId: id, type: "DESIGN_APPROVED" },
          _sum: { amount: true },
        })
        const pendingToCancel = pendingSum._sum.amount ?? 0
        if (pendingToCancel !== 0) {
          await appendLedgerEntry(tx, {
            userId: project.userId,
            projectId: id,
            amount: -pendingToCancel,
            type: CurrencyTransactionType.DESIGN_APPROVED,
            note: `Pending bits cancelled — build rejected`,
            createdBy: adminUserId,
          })
        }

        await tx.projectReviewAction.create({
          data: {
            projectId: id,
            stage: "BUILD",
            decision: buildReviewDecision,
            comments: sanitizedComments,
            grantAmount: null,
            reviewerId: adminUserId,
          },
        })

        return tx.project.update({
          where: { id },
          data: {
            buildStatus: decision,
            buildReviewComments: sanitizedComments,
            buildReviewedAt: now,
            buildReviewedBy: adminUserId,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                slackId: true,
              },
            },
            workSessions: {
              include: { media: true },
              orderBy: { createdAt: "desc" },
            },
            badges: true,
            bomItems: true,
          },
        })
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })

      await logAdminAction(
        AuditAction.ADMIN_REJECT_BUILD,
        authCheck.session.user.id,
        authCheck.session.user.email ?? undefined,
        "Project",
        id,
        { decision, comments: sanitizedComments }
      )

      if (updatedProject.user.slackId) {
        const projectUrl = `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/dashboard/projects/${id}`
        const lines: string[] = [`Your build for *${updatedProject.title}* needs changes to be approved. :rotating_light:`]
        if (sanitizedComments) lines.push(`\`\`\`${sanitizedComments}\`\`\``)
        lines.push(`<${projectUrl}|View project>`)
        sendSlackDM(updatedProject.user.slackId, lines.join("\n")).catch((err) =>
          console.error("Failed to send Slack DM for build rejection:", err)
        )
      }

      return NextResponse.json(updatedProject)
    }
  }
}
