import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission, hasRole, Role } from "@/lib/permissions"
import { getTierById } from "@/lib/tiers"

export async function GET(request: NextRequest) {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const isAdmin = hasRole(authCheck.roles, Role.ADMIN)
  const reviewerId = authCheck.session.user.id

  const url = request.nextUrl
  const search = url.searchParams.get("search") || ""
  const category = url.searchParams.get("category") || "" // DESIGN or BUILD
  const guide = url.searchParams.get("guide") || "" // starter project ID filter
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20")))
  const offset = (page - 1) * limit

  // Query projects directly — works whether or not ProjectSubmission rows exist
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projectWhere: any = {}

  // Filter by stage/status
  if (category === "DESIGN") {
    projectWhere.designStatus = "in_review"
  } else if (category === "BUILD") {
    projectWhere.buildStatus = "in_review"
  } else {
    projectWhere.OR = [
      { designStatus: "in_review" },
      { buildStatus: "in_review" },
    ]
  }

  // Filter by starter project guide
  if (guide === "custom") {
    projectWhere.starterProjectId = null
  } else if (guide) {
    projectWhere.starterProjectId = guide
  }

  // Non-admins should not see pre-reviewed projects (those are waiting for admin finalization)
  if (!isAdmin) {
    projectWhere.submissions = {
      none: { preReviewed: true },
    }
  }

  // Search filter
  if (search) {
    // Wrap existing OR in AND to combine with search
    const statusFilter = projectWhere.OR
    delete projectWhere.OR
    projectWhere.AND = [
      ...(statusFilter ? [{ OR: statusFilter }] : []),
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

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where: projectWhere,
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        workSessions: { select: { id: true, hoursClaimed: true, hoursApproved: true } },
        bomItems: { select: { id: true, totalCost: true, status: true } },
        submissions: {
          select: { id: true, stage: true, preReviewed: true },
          orderBy: { createdAt: "desc" },
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
    const totalWorkUnits = project.workSessions.reduce((sum, s) => sum + s.hoursClaimed, 0)
    const entryCount = project.workSessions.length
    const bomCost = project.bomItems
      .filter((b) => b.status === "approved" || b.status === "pending")
      .reduce((sum, b) => sum + b.totalCost, 0)

    // Determine which stage is in review
    const designInReview = project.designStatus === "in_review"
    const buildInReview = project.buildStatus === "in_review"
    const activeStage = buildInReview ? "BUILD" : designInReview ? "DESIGN" : "DESIGN"

    // Check if the latest submission for the active stage has been pre-reviewed
    const activeSubmission = project.submissions.find((s) => s.stage === activeStage)
    const preReviewed = activeSubmission?.preReviewed ?? false

    const waitingMs = Date.now() - new Date(project.updatedAt).getTime()

    return {
      id: project.id,
      projectId: project.id,
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
      bitsPerHour: (() => {
        if (totalWorkUnits <= 0 || !project.tier) return null
        const tierInfo = getTierById(project.tier)
        return tierInfo ? Math.round((tierInfo.bits / totalWorkUnits) * 10) / 10 : null
      })(),
      waitingMs,
      createdAt: project.updatedAt,
      preReviewed,
      claimedByOther: false,
      claimedBySelf: false,
      claimerName: null,
      reviewCount: 0,
      starterProjectId: project.starterProjectId,
    }
  })

  // For admins, sort pre-reviewed items to the top
  if (isAdmin) {
    items.sort((a, b) => {
      if (a.preReviewed && !b.preReviewed) return -1
      if (!a.preReviewed && b.preReviewed) return 1
      return 0
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
