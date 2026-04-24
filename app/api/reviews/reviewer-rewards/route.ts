import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

// Fudge & Hoodie event window: reviews from 2026-04-23 through 2026-05-07 inclusive.
const WINDOW_START = new Date("2026-04-23T00:00:00.000Z")
const WINDOW_END = new Date("2026-05-08T00:00:00.000Z") // exclusive upper bound

const FUDGE_THRESHOLD = 40
const HOODIE_THRESHOLD = 65

export async function GET() {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  // Load all first-pass SubmissionReviews in window (non-admin reviews).
  const firstPassInWindow = await prisma.submissionReview.findMany({
    where: {
      isAdminReview: false,
      invalidated: false,
      createdAt: { gte: WINDOW_START, lt: WINDOW_END },
    },
    select: {
      reviewerId: true,
      submissionId: true,
      createdAt: true,
      submission: { select: { projectId: true, stage: true } },
    },
  })

  // Load all ProjectReviewActions in window (finalized decisions).
  const prasInWindow = await prisma.projectReviewAction.findMany({
    where: {
      reviewerId: { not: null },
      createdAt: { gte: WINDOW_START, lt: WINDOW_END },
    },
    select: {
      id: true,
      reviewerId: true,
      projectId: true,
      stage: true,
      createdAt: true,
    },
  })

  // To attribute PRAs to the original (first-pass) reviewer, look up any first-pass
  // SubmissionReview (regardless of window) on the same project+stage that preceded
  // the PRA. Load every submission for these projects along with their first-pass
  // reviews so we can resolve in memory.
  const projectIds = Array.from(new Set(prasInWindow.map((p) => p.projectId)))
  const submissions = projectIds.length > 0
    ? await prisma.projectSubmission.findMany({
        where: { projectId: { in: projectIds } },
        select: {
          id: true,
          projectId: true,
          stage: true,
          createdAt: true,
          reviews: {
            where: { isAdminReview: false, invalidated: false },
            select: { reviewerId: true, createdAt: true },
          },
        },
      })
    : []

  const submissionsByProjectStage = new Map<string, typeof submissions>()
  for (const s of submissions) {
    const key = `${s.projectId}:${s.stage}`
    const arr = submissionsByProjectStage.get(key) ?? []
    arr.push(s)
    submissionsByProjectStage.set(key, arr)
  }
  // Newest submission first so we can find the latest one that predates a PRA.
  for (const arr of submissionsByProjectStage.values()) {
    arr.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  // For a PRA, return the first-pass reviewer on the relevant submission, or null.
  function firstPassReviewerFor(pra: (typeof prasInWindow)[number]): string | null {
    const key = `${pra.projectId}:${pra.stage}`
    const subs = submissionsByProjectStage.get(key) ?? []
    const sub = subs.find((s) => s.createdAt.getTime() <= pra.createdAt.getTime())
    if (!sub) return null
    const fp = sub.reviews
      .filter((r) => r.createdAt.getTime() <= pra.createdAt.getTime())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
    return fp?.reviewerId ?? null
  }

  // Count one point per review event. When a first-pass exists on a submission that
  // was later finalized, the PRA path credits the first-pass reviewer (so admin
  // rubber-stamps route credit to the original reviewer, per spec). Only
  // un-finalized first-pass reviews are counted from the SubmissionReview side, to
  // avoid double-counting the same submission.
  const counts = new Map<string, number>()

  // Track which (project, stage) pairs have a PRA in window at-or-after a given
  // first-pass timestamp — used to detect "finalized in window".
  const prasByProjectStage = new Map<string, Array<{ createdAt: Date }>>()
  for (const pra of prasInWindow) {
    const key = `${pra.projectId}:${pra.stage}`
    const arr = prasByProjectStage.get(key) ?? []
    arr.push({ createdAt: pra.createdAt })
    prasByProjectStage.set(key, arr)
  }

  for (const pra of prasInWindow) {
    const fpReviewerId = firstPassReviewerFor(pra)
    const attributedId = fpReviewerId ?? pra.reviewerId
    if (!attributedId) continue
    counts.set(attributedId, (counts.get(attributedId) ?? 0) + 1)
  }

  for (const sr of firstPassInWindow) {
    // If there's a PRA in window for the same project+stage created at-or-after
    // this first-pass review, the PRA branch already credited the reviewer —
    // skip to avoid double-counting.
    const key = `${sr.submission.projectId}:${sr.submission.stage}`
    const pras = prasByProjectStage.get(key) ?? []
    const finalized = pras.some((p) => p.createdAt.getTime() >= sr.createdAt.getTime())
    if (finalized) continue
    counts.set(sr.reviewerId, (counts.get(sr.reviewerId) ?? 0) + 1)
  }

  // Hydrate reviewer user rows for name/image.
  const reviewerIds = Array.from(counts.keys())
  const users = reviewerIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: reviewerIds } },
        select: { id: true, name: true, slackDisplayName: true, image: true },
      })
    : []
  const userMap = new Map(users.map((u) => [u.id, u]))

  const entries = reviewerIds
    .map((id) => {
      const count = counts.get(id) ?? 0
      const user = userMap.get(id)
      const tier: "hoodie" | "fudge" | "none" =
        count >= HOODIE_THRESHOLD ? "hoodie" : count >= FUDGE_THRESHOLD ? "fudge" : "none"
      return {
        reviewer: {
          id,
          name: user?.slackDisplayName || user?.name || null,
          image: user?.image ?? null,
        },
        count,
        tier,
      }
    })
    .sort((a, b) => b.count - a.count || (a.reviewer.name || "").localeCompare(b.reviewer.name || ""))

  return NextResponse.json({
    start: WINDOW_START.toISOString(),
    end: new Date(WINDOW_END.getTime() - 1).toISOString(),
    fudgeThreshold: FUDGE_THRESHOLD,
    hoodieThreshold: HOODIE_THRESHOLD,
    entries,
  })
}
