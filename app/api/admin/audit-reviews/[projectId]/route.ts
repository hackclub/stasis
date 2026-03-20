import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAnyPermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { getTierById } from "@/lib/tiers"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const authCheck = await requireAnyPermission(Permission.REVIEW_PROJECTS, Permission.VIEW_AUDIT_REVIEWS)
  if (authCheck.error) return authCheck.error

  const { projectId } = await params

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      user: {
        select: { id: true, name: true, image: true, email: true },
      },
      workSessions: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          hoursClaimed: true,
          hoursApproved: true,
          categories: true,
          stage: true,
          createdAt: true,
        },
      },
      bomItems: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          costPerItem: true,
          quantity: true,
          status: true,
          link: true,
        },
      },
      submissions: {
        orderBy: { createdAt: "desc" },
        include: {
          reviews: {
            orderBy: { createdAt: "asc" },
          },
        },
      },
      reviewActions: {
        orderBy: { createdAt: "asc" },
      },
    },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  // Collect all reviewer IDs
  const reviewerIds = new Set<string>()
  for (const sub of project.submissions) {
    for (const review of sub.reviews) {
      reviewerIds.add(review.reviewerId)
    }
  }
  for (const action of project.reviewActions) {
    if (action.reviewerId) reviewerIds.add(action.reviewerId)
  }

  const reviewerUsers = reviewerIds.size > 0
    ? await prisma.user.findMany({
        where: { id: { in: Array.from(reviewerIds) } },
        select: { id: true, name: true, image: true },
      })
    : []

  const reviewerMap = new Map(reviewerUsers.map((r) => [r.id, r]))

  const totalHours = project.workSessions.reduce(
    (sum, ws) => sum + (ws.hoursApproved ?? ws.hoursClaimed),
    0
  )
  const bomCost = project.bomItems
    .filter((item) => item.status !== "rejected")
    .reduce((sum, item) => sum + item.costPerItem * item.quantity, 0)
  const tierInfo = project.tier ? getTierById(project.tier) : null
  const tierBits = tierInfo?.bits ?? 0
  const bitsPerHour = totalHours > 0 ? Math.round(tierBits / totalHours) : null
  const costPerHour = totalHours > 0 ? bomCost / totalHours : 0

  // Build timeline: merge submission reviews and review actions
  const timeline: Array<{
    type: "review" | "action"
    createdAt: Date
    stage: string
    result: string | null
    decision: string | null
    feedback: string | null
    reason: string | null
    comments: string | null
    reviewer: { id: string; name: string | null; image: string | null } | null
    invalidated: boolean
    isAdminReview: boolean
    frozenWorkUnits: number | null
    frozenTier: number | null
    frozenFundingAmount: number | null
    tierOverride: number | null
    grantOverride: number | null
    workUnitsOverride: number | null
    grantAmount: number | null
    tier: number | null
    tierBefore: number | null
  }> = []

  for (const sub of project.submissions) {
    for (const review of sub.reviews) {
      timeline.push({
        type: "review",
        createdAt: review.createdAt,
        stage: sub.stage,
        result: review.result,
        decision: null,
        feedback: review.feedback,
        reason: review.reason,
        comments: null,
        reviewer: reviewerMap.get(review.reviewerId) ?? { id: review.reviewerId, name: null, image: null },
        invalidated: review.invalidated,
        isAdminReview: review.isAdminReview,
        frozenWorkUnits: review.frozenWorkUnits,
        frozenTier: review.frozenTier,
        frozenFundingAmount: review.frozenFundingAmount,
        tierOverride: review.tierOverride,
        grantOverride: review.grantOverride,
        workUnitsOverride: review.workUnitsOverride,
        grantAmount: null,
        tier: null,
        tierBefore: null,
      })
    }
  }

  for (const action of project.reviewActions) {
    timeline.push({
      type: "action",
      createdAt: action.createdAt,
      stage: action.stage,
      result: null,
      decision: action.decision,
      feedback: null,
      reason: null,
      comments: action.comments,
      reviewer: action.reviewerId
        ? reviewerMap.get(action.reviewerId) ?? { id: action.reviewerId, name: null, image: null }
        : null,
      invalidated: false,
      isAdminReview: false,
      frozenWorkUnits: null,
      frozenTier: null,
      frozenFundingAmount: null,
      tierOverride: null,
      grantOverride: null,
      workUnitsOverride: null,
      grantAmount: action.grantAmount,
      tier: action.tier,
      tierBefore: action.tierBefore,
    })
  }

  // Include grant change audit log entries
  const grantChangeLogs = await prisma.auditLog.findMany({
    where: {
      targetType: "Project",
      targetId: projectId,
      action: "ADMIN_APPROVE_DESIGN",
      metadata: { path: ["action"], equals: "update_grant" },
    },
    orderBy: { createdAt: "asc" },
  })

  for (const log of grantChangeLogs) {
    const meta = log.metadata as Record<string, unknown> | null
    const actor = log.actorId ? reviewerMap.get(log.actorId) ?? { id: log.actorId, name: log.actorEmail, image: null } : null
    timeline.push({
      type: "action",
      createdAt: log.createdAt,
      stage: "DESIGN",
      result: null,
      decision: "GRANT_UPDATED",
      feedback: null,
      reason: null,
      comments: `Grant changed from $${meta?.oldGrantAmount ?? '?'} to $${meta?.newGrantAmount ?? '?'}`,
      reviewer: actor,
      invalidated: false,
      isAdminReview: true,
      frozenWorkUnits: null,
      frozenTier: null,
      frozenFundingAmount: null,
      tierOverride: null,
      grantOverride: null,
      workUnitsOverride: null,
      grantAmount: typeof meta?.newGrantAmount === "number" ? meta.newGrantAmount : null,
      tier: null,
      tierBefore: null,
    })
  }

  timeline.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  return NextResponse.json({
    project: {
      id: project.id,
      title: project.title,
      tier: project.tier,
      coverImage: project.coverImage,
      designStatus: project.designStatus,
      buildStatus: project.buildStatus,
      author: project.user,
      totalHours: Math.round(totalHours * 100) / 100,
      bomCost: Math.round(bomCost * 100) / 100,
      costPerHour: Math.round(costPerHour * 100) / 100,
      bitsPerHour,
      tierBits,
      entryCount: project.workSessions.length,
      workSessions: project.workSessions,
      bomItems: project.bomItems,
    },
    timeline,
  })
}
