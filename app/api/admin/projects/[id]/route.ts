import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin, requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { logAdminAction, AuditAction } from "@/lib/audit"
import { fetchHackatimeProjectSeconds } from "@/lib/hackatime"
import { sanitize } from "@/lib/sanitize"
import { reverseDesignApproval, reverseBuildApproval, ReversalError } from "@/lib/project-approval-reversal"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          verificationStatus: true,
        },
      },
      deletedBy: {
        select: { id: true, name: true, slackDisplayName: true },
      },
      workSessions: {
        include: { media: true },
        orderBy: { createdAt: "desc" },
      },
      badges: true,
      bomItems: {
        orderBy: { createdAt: "desc" },
      },
      reviewActions: {
        orderBy: { createdAt: "desc" },
      },
      hackatimeProjects: true,
    },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const totalHoursClaimed = project.workSessions.reduce(
    (acc, s) => acc + s.hoursClaimed,
    0
  )
  const totalHoursApproved = project.workSessions.reduce(
    (acc, s) => acc + (s.hoursApproved ?? 0),
    0
  )

  // Fetch hackatime hours for each linked project
  const user = await prisma.user.findUnique({
    where: { id: project.userId },
    select: { hackatimeUserId: true, fraudConvicted: true },
  })

  // Fetch Hackatime trust level for the project author
  let hackatimeTrustLevel: string | null = null
  if (user?.hackatimeUserId) {
    try {
      const trustRes = await fetch(
        `https://hackatime.hackclub.com/api/v1/users/${encodeURIComponent(user.hackatimeUserId)}/trust_factor`,
        {
          headers: process.env.HACKATIME_ADMIN_KEY ? { Authorization: `Bearer ${process.env.HACKATIME_ADMIN_KEY}` } : {},
          signal: AbortSignal.timeout(10_000),
        }
      )
      if (trustRes.ok) {
        const trustData = await trustRes.json()
        hackatimeTrustLevel = trustData.trust_level ?? null
      }
    } catch {
      // ignore fetch/timeout errors
    }
  }

  const hackatimeProjectsWithHours = await Promise.all(
    project.hackatimeProjects.map(async (hp) => {
      const totalSeconds = user?.hackatimeUserId
        ? await fetchHackatimeProjectSeconds(user.hackatimeUserId, hp.hackatimeProject)
        : 0
      return {
        ...hp,
        totalSeconds,
      }
    })
  )

  return NextResponse.json({
    ...project,
    totalHoursClaimed,
    totalHoursApproved,
    hackatimeProjects: hackatimeProjectsWithHours,
    hackatimeTrustLevel,
    user: { ...project.user, fraudConvicted: user?.fraudConvicted ?? false },
    deletedBy: project.deletedBy ? { id: project.deletedBy.id, name: project.deletedBy.slackDisplayName || project.deletedBy.name } : null,
  })
}

// PATCH: admin-only actions — hide/unhide and unapprove design/build
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdmin()
  if (authCheck.error) return authCheck.error

  const { id } = await params
  const body = await request.json()
  const { action } = body

  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const adminId = authCheck.session.user.id
  const adminEmail = authCheck.session.user.email ?? undefined

  if (action === "delete") {
    const now = new Date()
    await prisma.project.update({ where: { id }, data: { deletedAt: now, deletedById: adminId } })
    await logAdminAction(AuditAction.ADMIN_DELETE_PROJECT, adminId, adminEmail, "Project", id, { title: project.title })
    return NextResponse.json({ deletedAt: now.toISOString(), deletedByName: authCheck.session.user.name })
  }

  if (action === "undelete") {
    await prisma.project.update({ where: { id }, data: { deletedAt: null, deletedById: null } })
    await logAdminAction(AuditAction.ADMIN_UNDELETE_PROJECT, adminId, adminEmail, "Project", id, { title: project.title })
    return NextResponse.json({ deletedAt: null, deletedByName: null })
  }

  if (action === "hide") {
    await prisma.project.update({ where: { id }, data: { hiddenFromGallery: true } })
    await logAdminAction(AuditAction.ADMIN_HIDE_PROJECT, adminId, adminEmail, "Project", id)
    return NextResponse.json({ hiddenFromGallery: true })
  }

  if (action === "unhide") {
    await prisma.project.update({ where: { id }, data: { hiddenFromGallery: false } })
    await logAdminAction(AuditAction.ADMIN_UNHIDE_PROJECT, adminId, adminEmail, "Project", id)
    return NextResponse.json({ hiddenFromGallery: false })
  }

  if (action === "unapprove_design" || action === "unapprove_build") {
    const rawReason = typeof body.reason === "string" ? body.reason.trim() : ""
    const reasonConfirmedEmpty = body.reasonConfirmedEmpty === true
    const allowNegativeBalance = body.allowNegativeBalance === true

    if (!rawReason && !reasonConfirmedEmpty) {
      return NextResponse.json(
        { error: "reason_required_or_confirm", message: "Provide a reason or confirm un-approval without one" },
        { status: 400 },
      )
    }
    const sanitizedReason = rawReason ? sanitize(rawReason) : null

    try {
      const outcome = action === "unapprove_design"
        ? await reverseDesignApproval(id, { adminId, adminEmail, reason: sanitizedReason, allowNegativeBalance })
        : await reverseBuildApproval(id, { adminId, adminEmail, reason: sanitizedReason, allowNegativeBalance })

      const partialFailures: string[] = []
      for (const err of outcome.airtable.errors) {
        partialFailures.push(`Airtable ${err.stage}: ${err.error}`)
      }
      if (outcome.unifiedDb.error) {
        partialFailures.push(`Unified DB: ${outcome.unifiedDb.error}`)
      }
      if (outcome.unifiedDb.skipped === "no_write_access" && outcome.unifiedDb.attempted.length > 0) {
        partialFailures.push(`Unified DB: API key lacks delete permission on ${outcome.unifiedDb.attempted.length} linked record(s); manual cleanup required`)
      }

      await logAdminAction(
        action === "unapprove_design" ? AuditAction.ADMIN_UNAPPROVE_DESIGN : AuditAction.ADMIN_UNAPPROVE_BUILD,
        adminId,
        adminEmail,
        "Project",
        id,
        {
          reason: sanitizedReason,
          reasonConfirmedEmpty: !sanitizedReason ? true : undefined,
          forcedNegativeBalance: allowNegativeBalance ? true : undefined,
          outcome,
        },
      )

      return NextResponse.json({
        designStatus: outcome.postgres.projectAfter.designStatus,
        buildStatus: outcome.postgres.projectAfter.buildStatus,
        balanceBefore: outcome.postgres.balanceBefore,
        balanceAfter: outcome.postgres.balanceAfter,
        ledgerEntries: outcome.postgres.ledgerEntries,
        airtableDeleted: outcome.airtable.records,
        unifiedDb: outcome.unifiedDb,
        partialFailures,
      })
    } catch (err) {
      if (err instanceof ReversalError) {
        return NextResponse.json(
          { error: err.code, message: err.message, detail: err.detail },
          { status: err.status },
        )
      }
      throw err
    }
  }

  if (action === "update_grant") {
    const { grantAmount } = body
    if (typeof grantAmount !== "number" || grantAmount < 0) {
      return NextResponse.json({ error: "grantAmount must be a non-negative number" }, { status: 400 })
    }

    const designAction = await prisma.projectReviewAction.findFirst({
      where: { projectId: id, stage: "DESIGN", decision: "APPROVED" },
      orderBy: { createdAt: "desc" },
    })

    if (!designAction) {
      return NextResponse.json({ error: "No approved design review action found" }, { status: 404 })
    }

    const oldAmount = designAction.grantAmount
    await prisma.projectReviewAction.update({
      where: { id: designAction.id },
      data: { grantAmount },
    })

    await logAdminAction(AuditAction.ADMIN_APPROVE_DESIGN, adminId, adminEmail, "Project", id, {
      action: "update_grant",
      oldGrantAmount: oldAmount,
      newGrantAmount: grantAmount,
    })

    return NextResponse.json({ success: true, oldGrantAmount: oldAmount, newGrantAmount: grantAmount })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
