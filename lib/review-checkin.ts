import prisma from "@/lib/prisma"
import { Prisma } from "@/app/generated/prisma/client"
import { sendSlackMessage } from "@/lib/slack"

// Daily review check-in: posts a Slack summary of how many reviews each core
// reviewer has done since the previous check-in, plus the current pending queue.
//
// "A review" matches the reviewer-leaderboard definition on /admin/review-data:
// a non-invalidated submission_review (first pass) OR a project_review_action
// (admin decision), counted per reviewer. The window is [lastCheckin, now] so a
// missed run (deploy blip, weekend) is absorbed into the next message rather
// than dropped — exactly "since the last check-in".

// #stasis-core — destination for the daily message.
const STASIS_CORE_CHANNEL = "C0AEDCHJ1LM"

// The core reviewers we report on, by user.id (prod). Display label is what
// shows in Slack. IDs are the active reviewing accounts (verified by volume);
// these people also have inactive duplicate accounts we deliberately exclude.
const CORE_REVIEWERS: { id: string; label: string }[] = [
  { id: "eJ2pr7JpLsYJ6HpqKBGa7rpxOKGJTqXL", label: "Clay" }, // clayanicholson@gmail.com
  { id: "FtOqR2W1OCbIwyV3iPcY4qFVvG9V3LVb", label: "Reem" }, // reemkhalifa110@gmail.com
  { id: "q5xUwQ91uYVINipcjZ7iQcStvw7Y1XVC", label: "Augie" }, // augie@hackclub.com
]

// Reuse the sync_run_log table as a checkpoint store (syncKey 'review_checkin').
// Each successful run records result.windowEnd; the next run reads it as the
// window start so windows are perfectly contiguous (no boundary double-count or
// gap from the row's own createdAt drifting past the captured `now`).
const SYNC_KEY = "review_checkin"

export interface ReviewCheckinResult {
  windowStart: string
  windowEnd: string
  counts: { id: string; label: string; reviews: number }[]
  total: number
  queue: { design: number; build: number; total: number }
  sent: boolean
  slackError?: string
  dryRun: boolean
}

async function getWindowStart(now: Date): Promise<Date> {
  const last = await prisma.syncRunLog.findFirst({
    where: { syncKey: SYNC_KEY },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, result: true },
  })
  if (last) {
    const r = last.result as { windowEnd?: string } | null
    if (r?.windowEnd) {
      const parsed = new Date(r.windowEnd)
      if (!Number.isNaN(parsed.getTime())) return parsed
    }
    return last.createdAt
  }
  // First run ever: default to the last 24h so we have a sensible first window.
  return new Date(now.getTime() - 24 * 60 * 60 * 1000)
}

function formatEt(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d)
}

function buildMessage(result: ReviewCheckinResult): string {
  const lines = result.counts.map((c) => `• ${c.label}: *${c.reviews}*`)
  return [
    `:mag: *Review check-in* — since ${formatEt(new Date(result.windowStart))} ET`,
    "",
    ...lines,
    `*Total: ${result.total} ${result.total === 1 ? "review" : "reviews"}*`,
    "",
    `Queue: *${result.queue.total}* pending (${result.queue.design} design · ${result.queue.build} build)`,
  ].join("\n")
}

export async function runReviewCheckin(
  opts: { dryRun?: boolean } = {}
): Promise<ReviewCheckinResult> {
  const dryRun = opts.dryRun ?? false
  const now = new Date()
  const windowStart = await getWindowStart(now)

  const ids = CORE_REVIEWERS.map((r) => r.id)

  // Reviews per core reviewer in (windowStart, now]. Matches the leaderboard:
  // submission_review (non-invalidated) + project_review_action (admin actions).
  const rows = await prisma.$queryRaw<{ reviewer_id: string; reviews: number }[]>`
    WITH all_reviews AS (
      SELECT "reviewerId" AS reviewer_id, "createdAt"
      FROM submission_review
      WHERE invalidated = false
      UNION ALL
      SELECT "reviewerId" AS reviewer_id, "createdAt"
      FROM project_review_action
      WHERE "reviewerId" IS NOT NULL
    )
    SELECT reviewer_id, COUNT(*)::int AS reviews
    FROM all_reviews
    WHERE reviewer_id IN (${Prisma.join(ids)})
      AND "createdAt" > ${windowStart}
      AND "createdAt" <= ${now}
    GROUP BY reviewer_id
  `
  const countById = new Map(rows.map((r) => [r.reviewer_id, r.reviews]))
  const counts = CORE_REVIEWERS.map((r) => ({
    id: r.id,
    label: r.label,
    reviews: countById.get(r.id) ?? 0,
  }))
  const total = counts.reduce((s, c) => s + c.reviews, 0)

  // Current pending queue — same definition as the review-data dashboard.
  const queueRows = await prisma.$queryRaw<[{ design: number; build: number }]>`
    WITH pending AS (
      SELECT DISTINCT ON (ps."projectId", ps.stage) ps.stage::text AS stage
      FROM project_submission ps
      JOIN project p ON p.id = ps."projectId"
      JOIN "user" u ON u.id = p."userId"
      WHERE p."deletedAt" IS NULL
        AND u."fraudConvicted" = false
        AND ((ps.stage = 'DESIGN' AND p."designStatus" = 'in_review')
          OR (ps.stage = 'BUILD' AND p."buildStatus" = 'in_review'))
      ORDER BY ps."projectId", ps.stage, ps."createdAt" DESC
    )
    SELECT
      COUNT(*) FILTER (WHERE stage = 'DESIGN')::int AS design,
      COUNT(*) FILTER (WHERE stage = 'BUILD')::int AS build
    FROM pending
  `
  const queue = {
    design: queueRows[0]?.design ?? 0,
    build: queueRows[0]?.build ?? 0,
    total: (queueRows[0]?.design ?? 0) + (queueRows[0]?.build ?? 0),
  }

  const result: ReviewCheckinResult = {
    windowStart: windowStart.toISOString(),
    windowEnd: now.toISOString(),
    counts,
    total,
    queue,
    sent: false,
    dryRun,
  }

  if (dryRun) return result

  const send = await sendSlackMessage(STASIS_CORE_CHANNEL, buildMessage(result))
  result.sent = send.ok
  if (!send.ok) result.slackError = send.error

  // Only advance the checkpoint once the message actually went out, so a Slack
  // failure rolls the window forward into the next run instead of losing it.
  if (send.ok) {
    await prisma.syncRunLog.create({
      data: {
        syncKey: SYNC_KEY,
        result: {
          windowStart: result.windowStart,
          windowEnd: result.windowEnd,
          total,
          counts: counts.map((c) => ({ label: c.label, reviews: c.reviews })),
          queue,
        } satisfies Prisma.InputJsonValue,
      },
    })
  }

  return result
}
