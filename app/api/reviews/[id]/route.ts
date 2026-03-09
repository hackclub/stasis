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

  // Try to find by submission ID first, then fall back to project ID
  let submission = await prisma.projectSubmission.findUnique({
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

  // Fall back: look up by project ID and find (or auto-create) a submission
  if (!submission) {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, image: true, slackId: true } },
        workSessions: {
          include: { media: true, timelapses: true },
          orderBy: { createdAt: "desc" },
        },
        badges: true,
        bomItems: true,
        submissions: {
          orderBy: { createdAt: "desc" },
          include: {
            reviews: { orderBy: { createdAt: "desc" } },
            claim: true,
          },
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 })
    }

    // Determine active stage
    const designInReview = project.designStatus === "in_review" || project.designStatus === "update_requested"
    const buildInReview = project.buildStatus === "in_review" || project.buildStatus === "update_requested"
    const activeStage = buildInReview ? "BUILD" : designInReview ? "DESIGN" : null

    if (!activeStage) {
      return NextResponse.json({ error: "Project is not in review" }, { status: 400 })
    }

    // Use existing submission for this stage, or auto-create one
    const existing = project.submissions.find((s) => s.stage === activeStage)
    if (existing) {
      // Re-fetch with full includes via the submission path
      submission = await prisma.projectSubmission.findUnique({
        where: { id: existing.id },
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
          reviews: { orderBy: { createdAt: "desc" } },
          claim: true,
        },
      })
    } else {
      // Auto-create a submission record for this project
      const newSub = await prisma.projectSubmission.create({
        data: {
          projectId: project.id,
          stage: activeStage,
        },
      })
      submission = await prisma.projectSubmission.findUnique({
        where: { id: newSub.id },
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
          reviews: { orderBy: { createdAt: "desc" } },
          claim: true,
        },
      })
    }
  }

  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 })
  }

  // Check for conflicts — other projects by same author in review
  const conflicts = await prisma.project.findMany({
    where: {
      id: { not: submission.project.id },
      userId: submission.project.userId,
      OR: [
        { designStatus: "in_review" },
        { buildStatus: "in_review" },
      ],
    },
    select: { id: true, title: true },
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

  // Find next/prev projects for navigation (query projects directly)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adjacentWhere: any = {
    OR: [
      { designStatus: { in: ["in_review", "update_requested"] } },
      { buildStatus: { in: ["in_review", "update_requested"] } },
    ],
  }

  const allProjects = await prisma.project.findMany({
    where: adjacentWhere,
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })

  const currentIdx = allProjects.findIndex((p) => p.id === submission!.project.id)
  const nextId = currentIdx >= 0 && currentIdx < allProjects.length - 1
    ? allProjects[currentIdx + 1].id
    : null
  const prevId = currentIdx > 0
    ? allProjects[currentIdx - 1].id
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
    conflicts: conflicts.map((c) => ({ id: c.id, project: { id: c.id, title: c.title } })),
    reviewerNote: reviewerNote?.content || "",
    navigation: { nextId, prevId },
    isAdmin,
    reviewerId,
  })
}
