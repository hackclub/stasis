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

  // Reviewer leaderboard stats — every review action counts for the person who
  // performed it, at the time they performed it. First-pass reviews
  // (SubmissionReview) and finalizations/returns (ProjectReviewAction) are
  // distinct actions created by distinct flows, so both earn credit and a
  // pre-reviewed project credits its first- and second-pass reviewers separately.
  const allReviewActions = await prisma.projectReviewAction.findMany({
    where: { reviewerId: { not: null } },
    select: { reviewerId: true, createdAt: true },
  })

  const allFirstPassReviews = await prisma.submissionReview.findMany({
    where: { isAdminReview: false, invalidated: false },
    select: { reviewerId: true, createdAt: true },
  })

  type ReviewEvent = { reviewerId: string; createdAt: Date }
  const allEvents: ReviewEvent[] = []

  for (const pra of allReviewActions) {
    if (pra.reviewerId) allEvents.push({ reviewerId: pra.reviewerId, createdAt: pra.createdAt })
  }
  for (const sr of allFirstPassReviews) {
    allEvents.push({ reviewerId: sr.reviewerId, createdAt: sr.createdAt })
  }

  const allReviewerIds = [...new Set(allEvents.map((e) => e.reviewerId))]
  const reviewers = allReviewerIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: allReviewerIds } },
        select: { id: true, name: true, slackDisplayName: true, image: true },
      })
    : []
  const reviewerMap = new Map(
    reviewers.map((r) => [r.id, { id: r.id, name: r.slackDisplayName || r.name, image: r.image }]),
  )

  // "Today" tab resets at midnight ET (not a rolling 24h window) so reviewers
  // can see what they've done since the start of the day. Compute start-of-day
  // in America/New_York, DST-aware, as a UTC instant.
  const etParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now))
  const et: Record<string, string> = {}
  for (const p of etParts) et[p.type] = p.value
  const wallAsUtc = Date.UTC(+et.year, +et.month - 1, +et.day, +et.hour, +et.minute, +et.second)
  const etOffset = wallAsUtc - now // ms the ET wall clock leads the true UTC instant
  const dayAgo = new Date(Date.UTC(+et.year, +et.month - 1, +et.day, 0, 0, 0) - etOffset)
  const dailyByReviewer = new Map<string, number>()
  const weeklyByReviewer = new Map<string, number>()
  const allTimeByReviewer = new Map<string, number>()

  for (const e of allEvents) {
    const t = e.createdAt.getTime()
    allTimeByReviewer.set(e.reviewerId, (allTimeByReviewer.get(e.reviewerId) || 0) + 1)
    if (t >= weekAgo.getTime()) {
      weeklyByReviewer.set(e.reviewerId, (weeklyByReviewer.get(e.reviewerId) || 0) + 1)
      if (t >= dayAgo.getTime()) {
        dailyByReviewer.set(e.reviewerId, (dailyByReviewer.get(e.reviewerId) || 0) + 1)
      }
    }
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
