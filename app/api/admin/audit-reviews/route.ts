import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAnyPermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { getTierById } from "@/lib/tiers"

export async function GET(request: NextRequest) {
  const authCheck = await requireAnyPermission(Permission.REVIEW_PROJECTS, Permission.VIEW_AUDIT_REVIEWS)
  if (authCheck.error) return authCheck.error

  const searchParams = request.nextUrl.searchParams
  const page = parseInt(searchParams.get("page") || "1", 10)
  const limit = parseInt(searchParams.get("limit") || "30", 10)
  const reviewer = searchParams.get("reviewer")
  const result = searchParams.get("result")
  const stage = searchParams.get("stage")
  const startDate = searchParams.get("startDate")
  const endDate = searchParams.get("endDate")
  const search = searchParams.get("search")
  const zeroGrant = searchParams.get("zeroGrant")

  // Build where clause for ProjectReviewAction
  const where: Record<string, unknown> = {}

  if (reviewer) {
    where.reviewerId = reviewer
  }

  // Map result filter to ReviewDecision enum values
  if (result) {
    const decisionMap: Record<string, string> = {
      APPROVED: "APPROVED",
      RETURNED: "CHANGE_REQUESTED",
      REJECTED: "REJECTED",
    }
    where.decision = decisionMap[result] || result
  }

  if (stage) {
    where.stage = stage
  }

  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) (where.createdAt as Record<string, Date>).gte = new Date(startDate)
    if (endDate) {
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      ;(where.createdAt as Record<string, Date>).lte = end
    }
  }

  if (search) {
    where.project = {
      title: { contains: search, mode: "insensitive" },
    }
  }

  if (zeroGrant === "true") {
    // Only match the latest design-approved action per project with $0/null grant
    const zeroGrantActions = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM (
        SELECT DISTINCT ON ("projectId") id, "grantAmount"
        FROM "project_review_action"
        WHERE stage = 'DESIGN' AND decision = 'APPROVED'
        ORDER BY "projectId", "createdAt" DESC
      ) latest
      WHERE "grantAmount" IS NULL OR "grantAmount" = 0
    `
    where.id = { in: zeroGrantActions.map((r) => r.id) }
  }

  const [actions, total, reviewerUsers] = await Promise.all([
    prisma.projectReviewAction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        project: {
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
            workSessions: {
              select: { hoursClaimed: true, hoursApproved: true },
            },
            bomItems: {
              select: { totalCost: true, status: true },
            },
          },
        },
      },
    }),
    prisma.projectReviewAction.count({ where }),
    // Get all reviewers who have ever performed a review action
    prisma.$queryRaw<Array<{ id: string; name: string | null; image: string | null }>>`
      SELECT DISTINCT u.id, u.name, u.image
      FROM "project_review_action" pra
      JOIN "user" u ON pra."reviewerId" = u.id
      WHERE pra."reviewerId" IS NOT NULL
      ORDER BY u.name ASC
    `,
  ])

  // Build reviewer lookup
  const reviewerMap = new Map(reviewerUsers.map((r) => [r.id, r]))

  const formattedReviews = actions.map((action) => {
    const project = action.project
    const totalHours = project.workSessions.reduce(
      (sum, ws) => sum + (ws.hoursApproved ?? ws.hoursClaimed),
      0
    )
    const bomCost = project.bomItems
      .filter((item) => item.status !== "rejected")
      .reduce((sum, item) => sum + item.totalCost, 0)
    const costPerHour = totalHours > 0 ? bomCost / totalHours : 0
    const effectiveTier = action.tier ?? project.tier
    const tierInfo = effectiveTier ? getTierById(effectiveTier) : null
    const tierBits = tierInfo?.bits ?? 0
    const bitsPerHour = totalHours > 0 ? Math.round(tierBits / totalHours) : null
    const entryCount = project.workSessions.length

    // Map decision back to result labels
    const resultLabel =
      action.decision === "CHANGE_REQUESTED" ? "RETURNED"
        : action.decision === "APPROVED" ? "APPROVED"
          : "REJECTED"

    const reviewerUser = action.reviewerId ? reviewerMap.get(action.reviewerId) : null

    return {
      id: action.id,
      result: resultLabel,
      feedback: action.comments || "",
      reason: null as string | null,
      createdAt: action.createdAt,
      invalidated: false,
      isAdminReview: true,
      reviewer: {
        id: action.reviewerId || "",
        name: reviewerUser?.name ?? null,
        image: reviewerUser?.image ?? null,
      },
      stage: action.stage,
      frozenWorkUnits: null as number | null,
      frozenTier: action.tierBefore,
      frozenFundingAmount: null as number | null,
      tierOverride: action.tier,
      grantOverride: action.grantAmount ? Math.round(action.grantAmount) : null,
      workUnitsOverride: null as number | null,
      project: {
        id: project.id,
        title: project.title,
        tier: project.tier,
        coverImage: project.coverImage,
        author: project.user,
        totalHours: Math.round(totalHours * 100) / 100,
        bomCost: Math.round(bomCost * 100) / 100,
        costPerHour: Math.round(costPerHour * 100) / 100,
        bitsPerHour,
        tierBits,
        entryCount,
      },
    }
  })

  return NextResponse.json({
    reviews: formattedReviews,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    reviewers: reviewerUsers,
  })
}
