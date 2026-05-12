import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { recordSyncRun } from "@/lib/sync-run-log"
import {
  openUserDM,
  fetchUserDMHistorySince,
  fetchUserDMThreadReplies,
  isSlackError,
  type UserDMTokens,
} from "@/lib/slack-user-dm"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// Scan Slack DM history for replies from any candidate currently in the
// "we've reached out, awaiting their answer" middle of the funnel, and
// append a `[auto] last reply <iso>: "<preview>"` comms entry per new
// reply. Idempotent — re-running only logs replies newer than what we
// already have on file.
const TARGET_STATUSES = ["CONTACTED", "SOFT_YES"] as const

// Step back 5 min from the most-recent comms entry when fetching history,
// so the outreach Slack message itself shows up in our top-level page and
// we can follow any thread replies on it. (Outreach slack ts is a hair
// earlier than the comms-entry createdAt the API writes.)
const SCAN_BUFFER_SECONDS = 5 * 60
const RATE_LIMIT_DELAY_MS = 300
const AUTO_PREFIX = "[auto] last reply"

/**
 * Resolve owner -> {xoxc, xoxd}. Tokens are NEVER persisted: the admin
 * pastes their .env block into a modal on the dashboard and we forward
 * it in the request body for this single call.
 *
 * Body shape:
 *   { tokens: { reem: { xoxc, xoxd }, meghana: { xoxc, xoxd }, ... } }
 *
 * Owner-name keys are lowercased and matched against each candidate's
 * owner first name. Anything we can't pair up is dropped.
 */
function parseOwnerTokensFromBody(body: unknown): Record<string, UserDMTokens> {
  const out: Record<string, UserDMTokens> = {}
  if (!body || typeof body !== "object") return out
  const tokens = (body as { tokens?: unknown }).tokens
  if (!tokens || typeof tokens !== "object") return out
  for (const [rawName, raw] of Object.entries(tokens as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue
    const pair = raw as { xoxc?: unknown; xoxd?: unknown }
    if (typeof pair.xoxc !== "string" || typeof pair.xoxd !== "string") continue
    if (!pair.xoxc.startsWith("xoxc-") || !pair.xoxd) continue
    out[rawName.toLowerCase()] = { xoxc: pair.xoxc, xoxd: pair.xoxd }
  }
  return out
}

function preview(text: string, max = 280): string {
  const t = text.replace(/\s+/g, " ").trim()
  return t.length > max ? t.slice(0, max) + "…" : t
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

type ResultRow = {
  candidateId: string
  name: string | null
  status: "logged" | "no_change" | "skipped" | "error"
  reason?: string
  ownerName?: string | null
  lastReplyAt?: string
}

export async function POST(request: NextRequest) {
  const authCheck = await requirePermission(Permission.MANAGE_ATTENDANCE)
  if (authCheck.error) return authCheck.error

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const ownerTokens = parseOwnerTokensFromBody(body)
  if (Object.keys(ownerTokens).length === 0) {
    return NextResponse.json(
      {
        error: "No valid owner tokens provided. Paste at least one SLACK_XOXC_<name> + SLACK_XOXD_<name> pair into the dialog.",
        code: "no_tokens",
      },
      { status: 400 }
    )
  }

  const candidates = await prisma.attendanceCandidate.findMany({
    where: { outreachStatus: { in: [...TARGET_STATUSES] } },
    include: {
      user: { select: { name: true, slackId: true } },
      owner: { select: { id: true, name: true } },
      commsEntries: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  })

  const results: ResultRow[] = []
  let logged = 0
  let noChange = 0
  let skipped = 0
  let errors = 0

  for (const c of candidates) {
    const slackId = c.user?.slackId ?? c.externalSlackId ?? null
    const displayName = c.user?.name ?? c.externalName ?? null
    const ownerName = c.owner?.name ?? null

    if (!slackId) {
      skipped++
      results.push({ candidateId: c.id, name: displayName, ownerName, status: "skipped", reason: "no_slack_id" })
      continue
    }
    if (!c.owner) {
      skipped++
      results.push({ candidateId: c.id, name: displayName, ownerName, status: "skipped", reason: "no_owner" })
      continue
    }
    const ownerFirstName = (c.owner.name ?? "").split(/\s+/)[0]?.toLowerCase() ?? ""
    const tokens = ownerTokens[ownerFirstName]
    if (!tokens) {
      skipped++
      results.push({
        candidateId: c.id, name: displayName, ownerName,
        status: "skipped", reason: `no_tokens:${ownerFirstName || "unknown_owner"}`,
      })
      continue
    }

    const latestComms = c.commsEntries[0]
    const scanFromMs = latestComms
      ? latestComms.createdAt.getTime()
      : (c.invitedAt?.getTime() ?? c.createdAt.getTime())
    const oldestUnix = ((scanFromMs / 1000) - SCAN_BUFFER_SECONDS).toString()

    try {
      const { channelId } = await openUserDM(tokens, slackId)
      const history = await fetchUserDMHistorySince(tokens, channelId, oldestUnix)

      const replies: { ts: string; text: string }[] = []
      for (const m of history) {
        if (m.user === slackId && !m.subtype) {
          replies.push({ ts: m.ts, text: m.text ?? "" })
        }
      }
      for (const m of history) {
        if ((m.reply_count ?? 0) <= 0) continue
        await sleep(RATE_LIMIT_DELAY_MS)
        const threadReplies = await fetchUserDMThreadReplies(tokens, channelId, m.ts)
        for (const r of threadReplies) {
          if (r.user === slackId && !r.subtype) {
            replies.push({ ts: r.ts, text: r.text ?? "" })
          }
        }
      }
      replies.sort((a, b) => Number(a.ts) - Number(b.ts))

      if (replies.length === 0) {
        noChange++
        results.push({ candidateId: c.id, name: displayName, ownerName, status: "no_change", reason: "no_replies_found" })
        await sleep(RATE_LIMIT_DELAY_MS)
        continue
      }

      const last = replies[replies.length - 1]!
      const lastMs = Math.floor(Number(last.ts) * 1000)

      // Idempotency: only insert if strictly newer than the most-recent
      // existing auto entry for this candidate.
      const existingAuto = await prisma.attendanceCommsEntry.findFirst({
        where: { candidateId: c.id, text: { startsWith: AUTO_PREFIX } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      })
      if (existingAuto && existingAuto.createdAt.getTime() >= lastMs) {
        noChange++
        results.push({ candidateId: c.id, name: displayName, ownerName, status: "no_change", reason: "already_logged" })
        await sleep(RATE_LIMIT_DELAY_MS)
        continue
      }

      const iso = new Date(lastMs).toISOString()
      const text = `${AUTO_PREFIX} ${iso}: "${preview(last.text)}" (${replies.length} message${replies.length === 1 ? "" : "s"} since blast)`

      await prisma.attendanceCommsEntry.create({
        data: {
          candidateId: c.id,
          authorId: c.owner.id,
          text,
          createdAt: new Date(lastMs),
        },
      })
      logged++
      results.push({
        candidateId: c.id, name: displayName, ownerName,
        status: "logged", lastReplyAt: iso,
      })
    } catch (err) {
      errors++
      const msg = isSlackError(err)
        ? `slack:${err.error}`
        : (err instanceof Error ? err.message : String(err))
      results.push({ candidateId: c.id, name: displayName, ownerName, status: "error", reason: msg })
    }

    await sleep(RATE_LIMIT_DELAY_MS)
  }

  const summary = {
    scanned: candidates.length,
    logged,
    noChange,
    skipped,
    errors,
  }
  await recordSyncRun("replies", summary, authCheck.session?.user.id ?? null)

  return NextResponse.json({
    ...summary,
    results,
    syncedAt: new Date().toISOString(),
  })
}
