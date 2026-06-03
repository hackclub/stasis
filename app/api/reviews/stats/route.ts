import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { hasRole, Permission, Role } from "@/lib/permissions"

function percentile(sortedMs: number[], p: number): number {
  if (sortedMs.length === 0) return 0
  const idx = Math.ceil((p / 100) * sortedMs.length) - 1
  return sortedMs[Math.max(0, idx)]
}

export async function GET() {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const isAdmin = hasRole(authCheck.roles, Role.ADMIN)
  const now = Date.now()
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)

  const pendingProjects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      user: { fraudConvicted: false },
      OR: [
        { designStatus: "in_review" },
        { buildStatus: "in_review" },
      ],
    },
    select: {
      id: true,
      designStatus: true,
      buildStatus: true,
      updatedAt: true,
      starterProjectId: true,
      workSessions: { select: { hoursClaimed: true } },
      submissions: {
        orderBy: { createdAt: "desc" },
        take: 2,
        select: { id: true, stage: true, preReviewed: true, createdAt: true },
      },
    },
  })

  const pendingCount = pendingProjects.length
  const totalPendingWorkUnits = pendingProjects.reduce((sum, p) => {
    return sum + p.workSessions.reduce((s, ws) => s + ws.hoursClaimed, 0)
  }, 0)

  const guideCounts: Record<string, number> = {}
  for (const p of pendingProjects) {
    const key = p.starterProjectId || "custom"
    guideCounts[key] = (guideCounts[key] || 0) + 1
  }

  function computeQueueStats(
    projects: typeof pendingProjects,
    stage: "DESIGN" | "BUILD",
  ) {
    const withWait = projects.map((p) => {
      const sub = p.submissions.find((s) => s.stage === stage)
      return {
        id: p.id,
        submissionId: sub?.id,
        waitMs: now - (sub ? sub.createdAt.getTime() : p.updatedAt.getTime()),
        preReviewed: sub?.preReviewed ?? false,
        workUnits: p.workSessions.reduce((s, ws) => s + ws.hoursClaimed, 0),
      }
    })

    const waitTimes = withWait.map((p) => p.waitMs).sort((a, b) => a - b)
    const longest = withWait.reduce<(typeof withWait)[0] | null>(
      (max, p) => (!max || p.waitMs > max.waitMs ? p : max),
      null,
    )

    return {
      count: projects.length,
      preReviewedCount: withWait.filter((p) => p.preReviewed).length,
      workUnits: Math.round(withWait.reduce((s, p) => s + p.workUnits, 0) * 10) / 10,
      waitP50Ms: percentile(waitTimes, 50),
      waitP95Ms: percentile(waitTimes, 95),
      waitMaxMs: waitTimes.length > 0 ? waitTimes[waitTimes.length - 1] : 0,
      waitMaxSubmissionId: longest?.submissionId ?? null,
    }
  }

  const designProjects = pendingProjects.filter((p) => p.designStatus === "in_review")
  const buildProjects = pendingProjects.filter((p) => p.buildStatus === "in_review")

  const designQueue = computeQueueStats(designProjects, "DESIGN")
  const buildQueue = computeQueueStats(buildProjects, "BUILD")

  // Strip pre-reviewed counts for non-admins
  if (!isAdmin) {
    designQueue.preReviewedCount = 0
    buildQueue.preReviewedCount = 0
  }

  // Reviewer leaderboard stats
  const allReviewActions = await prisma.projectReviewAction.findMany({
    where: { reviewerId: { not: null } },
    select: {
      reviewerId: true,
      createdAt: true,
    },
  })

  const reviewerIds = [...new Set(allReviewActions.map((r) => r.reviewerId).filter(Boolean))] as string[]
  const reviewers = reviewerIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: reviewerIds } },
        select: { id: true, name: true, slackDisplayName: true, image: true },
      })
    : []
  const reviewerMap = new Map(
    reviewers.map((r) => [r.id, { id: r.id, name: r.slackDisplayName || r.name, image: r.image }]),
  )

  const dayAgo = new Date(now - 24 * 60 * 60 * 1000)
  const dailyByReviewer = new Map<string, number>()
  const weeklyByReviewer = new Map<string, number>()
  const weeklyReviews = allReviewActions.filter((r) => new Date(r.createdAt) >= weekAgo)
  for (const r of weeklyReviews) {
    if (r.reviewerId) {
      weeklyByReviewer.set(r.reviewerId, (weeklyByReviewer.get(r.reviewerId) || 0) + 1)
      if (new Date(r.createdAt) >= dayAgo) {
        dailyByReviewer.set(r.reviewerId, (dailyByReviewer.get(r.reviewerId) || 0) + 1)
      }
    }
  }

  const allTimeByReviewer = new Map<string, number>()
  for (const r of allReviewActions) {
    if (r.reviewerId) allTimeByReviewer.set(r.reviewerId, (allTimeByReviewer.get(r.reviewerId) || 0) + 1)
  }

  const formatLeaderboard = (map: Map<string, number>) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({
        reviewer: reviewerMap.get(id) || { id, name: "Unknown", image: null },
        count,
      }))

  return NextResponse.json({
    pendingCount,
    totalPendingWorkUnits: Math.round(totalPendingWorkUnits * 10) / 10,
    topReviewersDaily: formatLeaderboard(dailyByReviewer),
    topReviewersWeekly: formatLeaderboard(weeklyByReviewer),
    topReviewersAllTime: formatLeaderboard(allTimeByReviewer),
    guideCounts,
    designQueue,
    buildQueue,
    isAdmin,
  })
}
