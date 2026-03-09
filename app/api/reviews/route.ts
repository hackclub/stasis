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

  // Build the submission query — only submissions currently in review
  const where: Record<string, unknown> = {
    project: {
      OR: [
        { designStatus: "in_review" },
        { buildStatus: "in_review" },
        { designStatus: "update_requested" },
        { buildStatus: "update_requested" },
      ],
    },
  }

  // Category filter
  if (category === "DESIGN" || category === "BUILD") {
    where.stage = category
  }

  // Search filter
  if (search) {
    where.OR = [
      { project: { title: { contains: search, mode: "insensitive" } } },
      { project: { user: { name: { contains: search, mode: "insensitive" } } } },
      { project: { user: { email: { contains: search, mode: "insensitive" } } } },
      { id: { contains: search } },
    ]
  }

  // For non-admin reviewers: exclude pre-reviewed and already-reviewed-by-self
  if (!isAdmin) {
    where.preReviewed = false
    where.NOT = {
      reviews: {
        some: {
          reviewerId,
          invalidated: false,
        },
      },
    }
  }

  const [submissions, total] = await Promise.all([
    prisma.projectSubmission.findMany({
      where,
      include: {
        project: {
          include: {
            user: { select: { id: true, name: true, email: true, image: true } },
            workSessions: { select: { id: true, hoursClaimed: true, hoursApproved: true } },
            bomItems: { select: { id: true, costPerItem: true, quantity: true, status: true } },
          },
        },
        reviews: {
          where: { invalidated: false },
          include: {
            submission: false,
          },
          orderBy: { createdAt: "desc" },
        },
        claim: true,
      },
      orderBy: { createdAt: "asc" }, // oldest first
      skip: offset,
      take: limit,
    }),
    prisma.projectSubmission.count({ where }),
  ])

  // Transform for the frontend
  const items = submissions.map((sub) => {
    const project = sub.project
    const totalWorkUnits = project.workSessions.reduce((sum, s) => sum + s.hoursClaimed, 0)
    const entryCount = project.workSessions.length
    const bomCost = project.bomItems
      .filter((b) => b.status === "approved" || b.status === "pending")
      .reduce((sum, b) => sum + b.costPerItem * b.quantity, 0)
    const waitingMs = Date.now() - new Date(sub.createdAt).getTime()

    const claimedByOther = sub.claim
      ? sub.claim.reviewerId !== reviewerId && new Date(sub.claim.expiresAt) > new Date()
      : false
    const claimedBySelf = sub.claim
      ? sub.claim.reviewerId === reviewerId && new Date(sub.claim.expiresAt) > new Date()
      : false

    return {
      id: sub.id,
      projectId: project.id,
      title: project.title,
      description: project.description,
      coverImage: project.coverImage,
      category: sub.stage,
      tier: project.tier,
      author: project.user,
      workUnits: Math.round(totalWorkUnits * 10) / 10,
      entryCount,
      bomCost: Math.round(bomCost * 100) / 100,
      costPerUnit: totalWorkUnits > 0 ? Math.round((bomCost / totalWorkUnits) * 100) / 100 : 0,
      waitingMs,
      createdAt: sub.createdAt,
      preReviewed: sub.preReviewed,
      claimedByOther,
      claimedBySelf,
      claimerName: claimedByOther ? sub.claim?.reviewerId : null,
      reviewCount: sub.reviews.length,
    }
  })

  // Sort: admin sees pre-reviewed first, then by waiting time
  if (isAdmin) {
    items.sort((a, b) => {
      if (a.preReviewed && !b.preReviewed) return -1
      if (!a.preReviewed && b.preReviewed) return 1
      return a.waitingMs - b.waitingMs
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
