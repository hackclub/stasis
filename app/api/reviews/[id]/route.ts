import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission, hasRole, Role } from "@/lib/permissions"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const { id } = await params
  const isAdmin = hasRole(authCheck.roles, Role.ADMIN)
  const reviewerId = authCheck.session.user.id

  const submission = await prisma.projectSubmission.findUnique({
    where: { id },
    include: {
      project: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true, slackId: true } },
          workSessions: {
            include: { media: true, timelapses: true },
            orderBy: { createdAt: "desc" },
          },
          badges: true,
          bomItems: true,
          submissions: {
            select: { id: true, stage: true, createdAt: true },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      reviews: {
        orderBy: { createdAt: "desc" },
      },
      claim: true,
    },
  })

  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 })
  }

  // Check for conflicts — other active submissions by same author in same stage
  const conflicts = await prisma.projectSubmission.findMany({
    where: {
      id: { not: id },
      project: {
        userId: submission.project.userId,
        OR: [
          { designStatus: "in_review" },
          { buildStatus: "in_review" },
        ],
      },
      stage: submission.stage,
    },
    include: {
      project: { select: { id: true, title: true } },
    },
  })

  // Get reviewer note about this author
  const reviewerNote = await prisma.reviewerNote.findUnique({
    where: { aboutUserId: submission.project.userId },
  })

  // Compute stats
  const workSessions = submission.project.workSessions
  const totalWorkUnits = workSessions.reduce((sum, s) => sum + s.hoursClaimed, 0)
  const entryCount = workSessions.length
  const avgWorkUnits = entryCount > 0 ? totalWorkUnits / entryCount : 0
  const maxWorkUnits = entryCount > 0 ? Math.max(...workSessions.map((s) => s.hoursClaimed)) : 0
  const minWorkUnits = entryCount > 0 ? Math.min(...workSessions.map((s) => s.hoursClaimed)) : 0
  const bomCost = submission.project.bomItems
    .filter((b) => b.status === "approved" || b.status === "pending")
    .reduce((sum, b) => sum + b.costPerItem * b.quantity, 0)

  const claimedByOther = submission.claim
    ? submission.claim.reviewerId !== reviewerId && new Date(submission.claim.expiresAt) > new Date()
    : false

  // Find next/prev submissions for navigation
  const adjacentWhere: Record<string, unknown> = {
    project: {
      OR: [
        { designStatus: "in_review" },
        { buildStatus: "in_review" },
        { designStatus: "update_requested" },
        { buildStatus: "update_requested" },
      ],
    },
  }
  if (!isAdmin) {
    adjacentWhere.preReviewed = false
  }

  const allSubmissions = await prisma.projectSubmission.findMany({
    where: adjacentWhere,
    select: { id: true, createdAt: true, preReviewed: true },
    orderBy: { createdAt: "asc" },
  })

  const currentIdx = allSubmissions.findIndex((s) => s.id === id)
  const nextId = currentIdx >= 0 && currentIdx < allSubmissions.length - 1
    ? allSubmissions[currentIdx + 1].id
    : null
  const prevId = currentIdx > 0
    ? allSubmissions[currentIdx - 1].id
    : null

  return NextResponse.json({
    submission: {
      id: submission.id,
      stage: submission.stage,
      notes: submission.notes,
      preReviewed: submission.preReviewed,
      createdAt: submission.createdAt,
      project: {
        ...submission.project,
        totalWorkUnits: Math.round(totalWorkUnits * 10) / 10,
        entryCount,
        avgWorkUnits: Math.round(avgWorkUnits * 10) / 10,
        maxWorkUnits: Math.round(maxWorkUnits * 10) / 10,
        minWorkUnits: Math.round(minWorkUnits * 10) / 10,
        bomCost: Math.round(bomCost * 100) / 100,
      },
      reviews: submission.reviews,
      claim: submission.claim,
      claimedByOther,
    },
    conflicts,
    reviewerNote: reviewerNote?.content || "",
    navigation: { nextId, prevId },
    isAdmin,
    reviewerId,
  })
}
