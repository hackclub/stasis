import prisma from "@/lib/prisma"

// Event lifecycle flags. Stasis ended 2026-06-30, so submissions are closed
// by default in code (the SUBMISSIONS_CLOSED env var was never flipped in
// Coolify and submissions silently stayed open for two weeks). Setting
// SUBMISSIONS_CLOSED=false re-opens them; per-user/per-project extensions
// below still override the gate either way. The flag is server-side only
// (not NEXT_PUBLIC_): the client learns it via GET /api/event-status.
export function submissionsClosed(): boolean {
  return process.env.SUBMISSIONS_CLOSED !== "false"
}

export const SUBMISSIONS_CLOSED_MESSAGE =
  "Stasis has ended and submissions are closed. Reviews of submitted work are still going out."

export const UNSUBMIT_CLOSED_MESSAGE =
  "Stasis has ended and submissions are closed. Unsubmitting is disabled because you would not be able to resubmit."

// ── Shop lifecycle ───────────────────────────────────────────────────────────

// The shop closes 2026-08-01 at midnight Eastern (04:00 UTC), so the last full
// day to spend is July 31. Anyone still in the review pipeline keeps shopping
// past that: a project awaiting review means bits may still be coming, and for
// SHOP_GRACE_DAYS after their most recent review they can actually spend what
// they were just awarded. Set SHOP_CLOSES_AT (ISO timestamp) to move the date.
export const SHOP_CLOSE_DATE = new Date(
  process.env.SHOP_CLOSES_AT || "2026-08-01T04:00:00.000Z"
)

// The close date is defined as midnight Eastern, so its human-facing label is
// always the Eastern calendar date. Formatting the instant in the viewer's own
// zone would tell anyone west of Eastern the shop closed July 31.
export const SHOP_TIMEZONE = "America/New_York"

export function formatShopDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    timeZone: SHOP_TIMEZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export const SHOP_GRACE_DAYS = 7
const SHOP_GRACE_MS = SHOP_GRACE_DAYS * 24 * 60 * 60 * 1000

export const SHOP_CLOSED_MESSAGE =
  "The Stasis shop is closed. It stays open while you have a project awaiting review, and for 7 days after your last review."

export type ShopAccessReason =
  // Before the close date - open to everyone.
  | "OPEN"
  // Closed for everyone else, but this user has work awaiting review.
  | "PENDING_REVIEW"
  // Closed for everyone else, but this user was reviewed in the grace window.
  | "GRACE_PERIOD"
  | "CLOSED"

export interface ShopAccess {
  closed: boolean
  closesAt: Date
  // True when the user has work sitting in the review queue. Their shop access
  // outlives the close date: it runs until SHOP_GRACE_DAYS after that review.
  pendingReview: boolean
  // End of the user's post-review window, when that is still in the future.
  // Populated before the close date too, so the "closing soon" copy can tell
  // someone the shop will not actually close for them yet.
  graceUntil: Date | null
  reason: ShopAccessReason
}

// Whether `userId` can still buy things. Ownership/eligibility of individual
// items is checked by the purchase paths as usual - this is only the global
// open/closed gate.
export async function getShopAccess(userId: string): Promise<ShopAccess> {
  const now = new Date()

  const [awaitingReview, lastReview] = await Promise.all([
    prisma.project.count({
      where: {
        userId,
        deletedAt: null,
        OR: [{ designStatus: "in_review" }, { buildStatus: "in_review" }],
      },
    }),
    prisma.project.aggregate({
      where: { userId, deletedAt: null },
      _max: { designReviewedAt: true, buildReviewedAt: true },
    }),
  ])

  const pendingReview = awaitingReview > 0

  const reviewedAt = [lastReview._max.designReviewedAt, lastReview._max.buildReviewedAt]
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime())[0]

  const graceEnd = reviewedAt ? new Date(reviewedAt.getTime() + SHOP_GRACE_MS) : null
  const graceUntil = graceEnd && graceEnd > now ? graceEnd : null

  const base = { closesAt: SHOP_CLOSE_DATE, pendingReview, graceUntil }

  if (now < SHOP_CLOSE_DATE) return { ...base, closed: false, reason: "OPEN" }
  if (pendingReview) return { ...base, closed: false, reason: "PENDING_REVIEW" }
  if (graceUntil) return { ...base, closed: false, reason: "GRACE_PERIOD" }

  return { ...base, closed: true, reason: "CLOSED" }
}

export interface SubmissionAccess {
  closed: boolean
  // When open only because of an extension, the latest applicable expiry.
  extensionUntil: Date | null
}

// Per-user/per-project override of the SUBMISSIONS_CLOSED gate. A user-level
// extension (user.submissionExtensionUntil) covers everything the user does,
// including creating new projects; a project-level extension
// (project.submissionExtensionUntil) covers actions on that project only.
// Ownership is NOT checked here - callers enforce it as usual.
export async function getSubmissionAccess(
  userId: string,
  projectId?: string
): Promise<SubmissionAccess> {
  if (!submissionsClosed()) {
    return { closed: false, extensionUntil: null }
  }

  const now = new Date()
  const [user, project] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { submissionExtensionUntil: true },
    }),
    projectId
      ? prisma.project.findUnique({
          where: { id: projectId },
          select: { submissionExtensionUntil: true },
        })
      : Promise.resolve(null),
  ])

  const candidates = [
    user?.submissionExtensionUntil,
    project?.submissionExtensionUntil,
  ].filter((d): d is Date => d != null && d > now)

  if (candidates.length === 0) {
    return { closed: true, extensionUntil: null }
  }

  return {
    closed: false,
    extensionUntil: candidates.sort((a, b) => b.getTime() - a.getTime())[0],
  }
}
