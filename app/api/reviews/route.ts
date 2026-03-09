import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission, hasRole, Role } from "@/lib/permissions"

export async function GET(request: NextRequest) {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const isAdmin = hasRole(authCheck.roles, Role.ADMIN)
  const reviewerId = authCheck.session.user.id

  const url = request.nextUrl
  const search = url.searchParams.get("search") || ""
  const category = url.searchParams.get("category") || "" // DESIGN or BUILD
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20")))
  const offset = (page - 1) * limit

  // Query projects directly — this ensures we find all projects in review
  // regardless of whether a ProjectSubmission record exists
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projectWhere: any = {}

  // Filter by stage/status
  if (category === "DESIGN") {
    projectWhere.designStatus = { in: ["in_review", "update_requested"] }
  } else if (category === "BUILD") {
    projectWhere.buildStatus = { in: ["in_review", "update_requested"] }
  } else {
    projectWhere.OR = [
      { designStatus: { in: ["in_review", "update_requested"] } },
      { buildStatus: { in: ["in_review", "update_requested"] } },
    ]
  }

  // Search filter
  if (search) {
    projectWhere.AND = [
      {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { user: { name: { contains: search, mode: "insensitive" } } },
          { user: { email: { contains: search, mode: "insensitive" } } },
          { id: { contains: search } },
        ],
      },
    ]
  }

  // For non-admin reviewers: exclude pre-reviewed projects
  if (!isAdmin) {
    projectWhere.submissions = {
      none: {
        preReviewed: true,
      },
    }
  }

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where: projectWhere,
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        workSessions: { select: { id: true, hoursClaimed: true, hoursApproved: true } },
        bomItems: { select: { id: true, costPerItem: true, quantity: true, status: true } },
        submissions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            reviews: {
              where: { invalidated: false },
              orderBy: { createdAt: "desc" },
            },
            claim: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
      skip: offset,
      take: limit,
    }),
    prisma.project.count({ where: projectWhere }),
  ])

  // Transform for the frontend
  const items = projects.map((project) => {
    const submission = project.submissions[0] || null
    const totalWorkUnits = project.workSessions.reduce((sum, s) => sum + s.hoursClaimed, 0)
    const entryCount = project.workSessions.length
    const bomCost = project.bomItems
      .filter((b) => b.status === "approved" || b.status === "pending")
      .reduce((sum, b) => sum + b.costPerItem * b.quantity, 0)

    // Determine which stage is in review
    const designInReview = project.designStatus === "in_review" || project.designStatus === "update_requested"
    const buildInReview = project.buildStatus === "in_review" || project.buildStatus === "update_requested"
    const activeStage = buildInReview ? "BUILD" : designInReview ? "DESIGN" : "DESIGN"

    const submittedAt = submission?.createdAt || project.updatedAt
    const waitingMs = Date.now() - new Date(submittedAt).getTime()

    const preReviewed = submission?.preReviewed || false

    const claimedByOther = submission?.claim
      ? submission.claim.reviewerId !== reviewerId && new Date(submission.claim.expiresAt) > new Date()
      : false
    const claimedBySelf = submission?.claim
      ? submission.claim.reviewerId === reviewerId && new Date(submission.claim.expiresAt) > new Date()
      : false

    return {
      id: submission?.id || project.id, // Use submission ID if available, project ID as fallback
      projectId: project.id,
      submissionId: submission?.id || null,
      title: project.title,
      description: project.description,
      coverImage: project.coverImage,
      category: activeStage,
      tier: project.tier,
      author: project.user,
      workUnits: Math.round(totalWorkUnits * 10) / 10,
      entryCount,
      bomCost: Math.round(bomCost * 100) / 100,
      costPerUnit: totalWorkUnits > 0 ? Math.round((bomCost / totalWorkUnits) * 100) / 100 : 0,
      waitingMs,
      createdAt: submittedAt,
      preReviewed,
      claimedByOther,
      claimedBySelf,
      claimerName: claimedByOther ? submission?.claim?.reviewerId : null,
      reviewCount: submission?.reviews.length || 0,
    }
  })

  // Sort: admin sees pre-reviewed first, then by waiting time
  if (isAdmin) {
    items.sort((a, b) => {
      if (a.preReviewed && !b.preReviewed) return -1
      if (!a.preReviewed && b.preReviewed) return 1
      return b.waitingMs - a.waitingMs
    })
  }

  return NextResponse.json({
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    isAdmin,
  })
}
