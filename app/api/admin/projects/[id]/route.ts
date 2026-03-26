import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin, requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { logAdminAction, AuditAction } from "@/lib/audit"
import { fetchHackatimeProjectSeconds } from "@/lib/hackatime"

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
        select: { id: true, name: true },
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

  return NextResponse.json({ ...project, totalHoursClaimed, totalHoursApproved, hackatimeProjects: hackatimeProjectsWithHours, hackatimeTrustLevel, user: { ...project.user, fraudConvicted: user?.fraudConvicted ?? false } })
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

  if (action === "unapprove_design") {
    if (project.designStatus !== "approved") {
      return NextResponse.json({ error: "Design is not approved" }, { status: 400 })
    }
    await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: { designStatus: "in_review", buildStatus: "draft" },
      })
      // Remove any stale DESIGN submissions, then create a fresh one
      await tx.projectSubmission.deleteMany({ where: { projectId: id, stage: "DESIGN" } })
      await tx.projectSubmission.create({
        data: { projectId: id, stage: "DESIGN" },
      })
    })
    await logAdminAction(AuditAction.ADMIN_UNAPPROVE_DESIGN, adminId, adminEmail, "Project", id)
    return NextResponse.json({ designStatus: "in_review", buildStatus: "draft" })
  }

  if (action === "unapprove_build") {
    if (project.buildStatus !== "approved") {
      return NextResponse.json({ error: "Build is not approved" }, { status: 400 })
    }
    await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: { buildStatus: "in_review" },
      })
      await tx.projectSubmission.deleteMany({ where: { projectId: id, stage: "BUILD" } })
      await tx.projectSubmission.create({
        data: { projectId: id, stage: "BUILD" },
      })
    })
    await logAdminAction(AuditAction.ADMIN_UNAPPROVE_BUILD, adminId, adminEmail, "Project", id)
    return NextResponse.json({ buildStatus: "in_review" })
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
