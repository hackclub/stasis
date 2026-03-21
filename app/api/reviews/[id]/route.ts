import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission, hasRole, Role } from "@/lib/permissions"
import { getTierById } from "@/lib/tiers"
import { fetchHackatimeProjectSeconds } from "@/lib/hackatime"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const { id } = await params
  const isAdmin = hasRole(authCheck.roles, Role.ADMIN)
  const reviewerId = authCheck.session.user.id

  // Try as project ID first (most common path from queue), then submission ID
  let project = await prisma.project.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, image: true, slackId: true, hackatimeUserId: true, fraudConvicted: true, verificationStatus: true } },
      workSessions: {
        include: { media: true, timelapses: true },
        orderBy: { createdAt: "desc" },
      },
      badges: true,
      bomItems: true,
      hackatimeProjects: true,
      reviewActions: {
        orderBy: { createdAt: "desc" },
      },
    },
  })

  // Fall back: try finding a submission and get its project
  if (!project) {
    const submission = await prisma.projectSubmission.findUnique({
      where: { id },
      select: { projectId: true },
    })
    if (submission) {
      project = await prisma.project.findUnique({
        where: { id: submission.projectId },
        include: {
          user: { select: { id: true, name: true, email: true, image: true, slackId: true, hackatimeUserId: true, fraudConvicted: true, verificationStatus: true } },
          workSessions: {
            include: { media: true, timelapses: true },
            orderBy: { createdAt: "desc" },
          },
          badges: true,
          bomItems: true,
          hackatimeProjects: true,
          reviewActions: {
            orderBy: { createdAt: "desc" },
          },
        },
      })
    }
  }

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  // Determine active stage
  const designInReview = project.designStatus === "in_review"
  const buildInReview = project.buildStatus === "in_review"
  const activeStage = buildInReview ? "BUILD" : designInReview ? "DESIGN" : null

  if (!activeStage) {
    return NextResponse.json({ error: "Project is not in review" }, { status: 400 })
  }

  // Check for conflicts — other projects by same author in review
  const conflicts = await prisma.project.findMany({
    where: {
      id: { not: project.id },
      userId: project.userId,
      OR: [
        { designStatus: "in_review" },
        { buildStatus: "in_review" },
      ],
    },
    select: { id: true, title: true },
  })

  // Try to get reviewer note (may not exist if migration not run)
  let reviewerNoteContent = ""
  try {
    const reviewerNote = await prisma.reviewerNote.findUnique({
      where: { aboutUserId: project.userId },
    })
    reviewerNoteContent = reviewerNote?.content || ""
  } catch {
    // Table doesn't exist yet — that's fine
  }

  // Fetch Hackatime trust level for the project author
  let hackatimeTrustLevel: string | null = null
  if (project.user.hackatimeUserId) {
    try {
      const trustRes = await fetch(
        `https://hackatime.hackclub.com/api/v1/users/${encodeURIComponent(project.user.hackatimeUserId)}/trust_factor`,
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

  // Fetch firmware hours from linked hackatime projects
  const hackatimeProjectsWithHours = await Promise.all(
    project.hackatimeProjects.map(async (hp) => {
      const totalSeconds = project.user.hackatimeUserId
        ? await fetchHackatimeProjectSeconds(project.user.hackatimeUserId, hp.hackatimeProject)
        : 0
      return { ...hp, totalSeconds }
    })
  )
  const firmwareHours = hackatimeProjectsWithHours.reduce((sum, hp) => {
    const hours = hp.hoursApproved !== null ? hp.hoursApproved : hp.totalSeconds / 3600
    return sum + hours
  }, 0)

  // Compute stats
  const workSessions = project.workSessions
  const journalHours = workSessions.reduce((sum, s) => sum + s.hoursClaimed, 0)
  const totalWorkUnits = journalHours + firmwareHours
  const entryCount = workSessions.length
  const avgWorkUnits = entryCount > 0 ? journalHours / entryCount : 0
  const maxWorkUnits = entryCount > 0 ? Math.max(...workSessions.map((s) => s.hoursClaimed)) : 0
  const minWorkUnits = entryCount > 0 ? Math.min(...workSessions.map((s) => s.hoursClaimed)) : 0
  const bomCost = project.bomItems
    .filter((b) => b.status === "approved" || b.status === "pending")
    .reduce((sum, b) => sum + b.totalCost, 0)

  // Get submission notes if available
  const latestSubmission = await prisma.projectSubmission.findFirst({
    where: { projectId: project.id, stage: activeStage },
    orderBy: { createdAt: "desc" },
    select: { id: true, notes: true, createdAt: true, preReviewed: true },
  }).catch(() => null)

  // Fetch SubmissionReview records for the latest submission (has isAdminReview flag)
  const submissionReviews = latestSubmission
    ? await prisma.submissionReview.findMany({
        where: { submissionId: latestSubmission.id },
        orderBy: { createdAt: "desc" },
      }).catch(() => [] as Array<{ id: string; submissionId: string; reviewerId: string; result: string; isAdminReview: boolean; feedback: string; reason: string | null; invalidated: boolean; workUnitsOverride: number | null; tierOverride: number | null; grantOverride: number | null; categoryOverride: string | null; frozenWorkUnits: number | null; frozenEntryCount: number | null; frozenFundingAmount: number | null; frozenTier: number | null; frozenReviewerNote: string | null; createdAt: Date }>)
    : []

  // Build a set of reviewer+decision pairs from SubmissionReview records
  // to determine isAdminReview for matching ProjectReviewAction records
  const submissionReviewKeys = new Set(
    submissionReviews.map((sr) => `${sr.reviewerId}:${sr.result === "RETURNED" ? "CHANGE_REQUESTED" : sr.result}`)
  )
  const submissionReviewAdminMap = new Map(
    submissionReviews.map((sr) => [
      `${sr.reviewerId}:${sr.result === "RETURNED" ? "CHANGE_REQUESTED" : sr.result}`,
      sr.isAdminReview,
    ])
  )

  // Fetch reviewer names for past reviews
  const allReviewerIds = [
    ...project.reviewActions.map((a) => a.reviewerId),
    ...submissionReviews.map((sr) => sr.reviewerId),
  ].filter((id): id is string => !!id)
  const reviewerUsers = allReviewerIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: [...new Set(allReviewerIds)] } },
        select: { id: true, name: true, slackDisplayName: true },
      })
    : []
  const reviewerNameMap = new Map(reviewerUsers.map((u) => [u.id, u.slackDisplayName || u.name]))

  // Map existing ProjectReviewAction records to the review format the frontend expects
  const reviewActionKeys = new Set(
    project.reviewActions.map((a) => `${a.reviewerId}:${a.decision}`)
  )
  const reviews = [
    ...project.reviewActions.map((action) => {
      const key = `${action.reviewerId}:${action.decision}`
      const hasSubmissionReview = submissionReviewKeys.has(key)
      const isAdminReview = hasSubmissionReview
        ? (submissionReviewAdminMap.get(key) ?? true)
        : true // legacy records without SubmissionReview are assumed admin

      return {
        id: action.id,
        reviewerId: action.reviewerId || "",
        reviewerName: action.reviewerId ? (reviewerNameMap.get(action.reviewerId) || null) : null,
        result: action.decision === "CHANGE_REQUESTED" ? "RETURNED" : action.decision,
        isAdminReview,
        feedback: action.comments || "",
        reason: null as string | null,
        invalidated: false,
        workUnitsOverride: null as number | null,
        tierOverride: action.tier,
        grantOverride: action.grantAmount ? Math.round(action.grantAmount) : null,
        categoryOverride: null as string | null,
        frozenWorkUnits: null as number | null,
        frozenEntryCount: null as number | null,
        frozenFundingAmount: null as number | null,
        frozenTier: action.tierBefore,
        frozenReviewerNote: null as string | null,
        createdAt: action.createdAt,
      }
    }),
    // Include first-pass SubmissionReview records that have no matching ProjectReviewAction
    ...submissionReviews
      .filter((sr) => {
        const mappedDecision = sr.result === "RETURNED" ? "CHANGE_REQUESTED" : sr.result
        return !reviewActionKeys.has(`${sr.reviewerId}:${mappedDecision}`)
      })
      .map((sr) => ({
        id: sr.id,
        reviewerId: sr.reviewerId,
        reviewerName: reviewerNameMap.get(sr.reviewerId) || null,
        result: sr.result,
        isAdminReview: sr.isAdminReview,
        feedback: sr.feedback || "",
        reason: sr.reason,
        invalidated: sr.invalidated,
        workUnitsOverride: sr.workUnitsOverride,
        tierOverride: sr.tierOverride,
        grantOverride: sr.grantOverride,
        categoryOverride: sr.categoryOverride,
        frozenWorkUnits: sr.frozenWorkUnits,
        frozenEntryCount: sr.frozenEntryCount,
        frozenFundingAmount: sr.frozenFundingAmount,
        frozenTier: sr.frozenTier,
        frozenReviewerNote: sr.frozenReviewerNote,
        createdAt: sr.createdAt,
      })),
  ]

  // Find next/prev projects for navigation
  const allProjects = await prisma.project.findMany({
    where: {
      OR: [
        { designStatus: "in_review" },
        { buildStatus: "in_review" },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  })

  const currentIdx = allProjects.findIndex((p) => p.id === project!.id)
  const nextId = currentIdx >= 0 && currentIdx < allProjects.length - 1
    ? allProjects[currentIdx + 1].id
    : null
  const prevId = currentIdx > 0
    ? allProjects[currentIdx - 1].id
    : null

  return NextResponse.json({
    submission: {
      id: latestSubmission?.id || project.id,
      stage: activeStage,
      notes: latestSubmission?.notes || (activeStage === "DESIGN" ? project.designSubmissionNotes : project.buildSubmissionNotes),
      preReviewed: latestSubmission?.preReviewed ?? false,
      createdAt: latestSubmission?.createdAt || project.updatedAt,
      project: {
        ...project,
        reviewActions: undefined,
        hackatimeProjects: hackatimeProjectsWithHours,
        firmwareHours: Math.round(firmwareHours * 10) / 10,
        journalHours: Math.round(journalHours * 10) / 10,
        totalWorkUnits: Math.round(totalWorkUnits * 10) / 10,
        entryCount,
        avgWorkUnits: Math.round(avgWorkUnits * 10) / 10,
        maxWorkUnits: Math.round(maxWorkUnits * 10) / 10,
        minWorkUnits: Math.round(minWorkUnits * 10) / 10,
        bomCost: Math.round(bomCost * 100) / 100,
        costPerHour: totalWorkUnits > 0 ? Math.round((bomCost / totalWorkUnits) * 100) / 100 : null,
        bitsPerHour: (() => {
          if (totalWorkUnits <= 0 || !project.tier) return null
          const tierInfo = getTierById(project.tier)
          return tierInfo ? Math.round((tierInfo.bits / totalWorkUnits) * 10) / 10 : null
        })(),
      },
      reviews,
      claim: null,
      claimedByOther: false,
    },
    conflicts: conflicts.map((c) => ({ id: c.id, project: { id: c.id, title: c.title } })),
    reviewerNote: reviewerNoteContent,
    hackatimeTrustLevel,
    navigation: { nextId, prevId },
    isAdmin,
    reviewerId,
  })
}
