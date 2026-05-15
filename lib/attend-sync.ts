import type { PrismaClient } from "@/app/generated/prisma/client"
import { lookupAttendByEmailsOrSlackIds, lookupPendingInvitesByEmails, getAttendPool, STASIS_EVENT_ID, type AttendStatus } from "./attend-db"

/**
 * Three-state UI bucket for the Attend lifecycle.
 *   invited  — invitation sent, not yet started onboarding
 *   wip      — onboarding in progress (mid-flow or awaiting parent waiver)
 *   complete — onboarding finished
 *
 * Pure / client-safe. Used by both the sync writes (server) and the kanban /
 * table / modal rendering (client) so the buckets stay in lockstep.
 */
export type AttendDisplayState = "invited" | "wip" | "complete" | null

export const ATTEND_DISPLAY_LABEL: Record<NonNullable<AttendDisplayState>, string> = {
  invited: "Attend Invited",
  wip: "Attend WIP",
  complete: "Attend Complete",
}

export function deriveAttendDisplayState(c: {
  attendInvited: boolean
  attendOnboardingStarted: boolean
  attendStatus: string | null
}): AttendDisplayState {
  const s = c.attendStatus
  if (s === "complete") return "complete"
  if (s === "in_progress" || s === "awaiting_guardian") return "wip"
  if (c.attendInvited && (!c.attendOnboardingStarted || s === "invited")) return "invited"
  return null
}

export interface AttendSyncSummary {
  scanned: number
  updated: number
  bumped: number
  skipped?: boolean
  errors: Array<{ candidateId?: string; stage: string; message: string }>
}

interface SyncRow {
  id: string
  outreachStatus: string
  invitedAt: Date | null
  attendInvited: boolean
  attendOnboardingStarted: boolean
  attendFlightBooked: boolean
  attendStatus: string | null
  attendCity: string | null
  attendState: string | null
  attendCountry: string | null
  email: string | null
  slackId: string | null
}

interface DesiredFields {
  attendInvited?: boolean
  attendOnboardingStarted?: boolean
  attendFlightBooked?: boolean
  attendStatus?: string | null
  attendCity?: string | null
  attendState?: string | null
  attendCountry?: string | null
  invitedAt?: Date
  outreachStatus?: string
}

const ADVISORY_LOCK_KEY = BigInt("8273409128732") // arbitrary stable bigint for pg_try_advisory_lock

/**
 * Refresh cached Attend fields on AttendanceCandidate rows from the read-only
 * Attend DB. Two modes:
 *
 *   - candidateIds provided: refresh just those rows (no lock).
 *   - no candidateIds: full sweep across every candidate with an email,
 *     guarded by a Postgres advisory lock so concurrent cron firings don't
 *     stomp each other.
 *
 * Diff-only writes: only touches columns whose value actually changed. When
 * only `attendCachedAt` would change (i.e. nothing real moved), we update via
 * raw SQL so Prisma's `@updatedAt` doesn't fire — keeps the dashboard's
 * secondary sort by updatedAt stable.
 *
 * Auto-bump: any candidate found in Attend whose outreachStatus is still
 * IDENTIFIED is promoted to CONTACTED and an audit entry is written. Keeps
 * the sourcing view free of people who already accepted an invite.
 */
export async function syncCandidatesAgainstAttend(
  prisma: PrismaClient,
  opts: { candidateIds?: string[]; actorLabel: "cron" | "manual" | "invite" }
): Promise<AttendSyncSummary> {
  const errors: AttendSyncSummary["errors"] = []
  const isFullSweep = !opts.candidateIds

  if (!getAttendPool()) {
    return {
      scanned: 0,
      updated: 0,
      bumped: 0,
      errors: [{ stage: "env", message: "READONLY_ATTEND_DATABASE_URL not set" }],
    }
  }

  // Advisory lock for full sweeps so two cron firings never overlap. Per-row
  // syncs skip this so the modal's "Sync now" button is always responsive.
  if (isFullSweep) {
    const got = await prisma.$queryRaw<Array<{ ok: boolean }>>`
      SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}::bigint) AS ok
    `
    if (!got[0]?.ok) {
      return { scanned: 0, updated: 0, bumped: 0, skipped: true, errors: [] }
    }
  }

  try {
    const raw = await prisma.attendanceCandidate.findMany({
      where: opts.candidateIds ? { id: { in: opts.candidateIds } } : {},
      select: {
        id: true,
        outreachStatus: true,
        invitedAt: true,
        attendInvited: true,
        attendOnboardingStarted: true,
        attendFlightBooked: true,
        attendStatus: true,
        attendCity: true,
        attendState: true,
        attendCountry: true,
        externalEmail: true,
        externalSlackId: true,
        user: { select: { email: true, slackId: true } },
      },
    })

    const candidates: SyncRow[] = raw
      .map((c): SyncRow | null => {
        const email = c.user?.email ?? c.externalEmail ?? null
        const slackId = c.user?.slackId ?? c.externalSlackId ?? null
        if (!email && !slackId) return null
        return {
          id: c.id,
          outreachStatus: c.outreachStatus,
          invitedAt: c.invitedAt,
          attendInvited: c.attendInvited,
          attendOnboardingStarted: c.attendOnboardingStarted,
          attendFlightBooked: c.attendFlightBooked,
          attendStatus: c.attendStatus,
          attendCity: c.attendCity,
          attendState: c.attendState,
          attendCountry: c.attendCountry,
          email: email ? email.toLowerCase() : null,
          slackId,
        }
      })
      .filter((x): x is SyncRow => x !== null)

    if (candidates.length === 0) {
      return { scanned: 0, updated: 0, bumped: 0, errors }
    }

    const allEmails = Array.from(new Set(candidates.map((c) => c.email).filter((e): e is string => !!e)))
    const allSlackIds = Array.from(new Set(candidates.map((c) => c.slackId).filter((s): s is string => !!s)))

    // Two batched lookups in parallel against the Attend replica.
    let byEmail = new Map<string, AttendStatus>()
    let bySlackId = new Map<string, AttendStatus>()
    let pending = new Map<string, { invitedAt: Date; acceptedAt: Date | null }>()
    try {
      const result = await lookupAttendByEmailsOrSlackIds(allEmails, allSlackIds)
      byEmail = result.byEmail
      bySlackId = result.bySlackId
    } catch (err) {
      errors.push({ stage: "lookup", message: err instanceof Error ? err.message : String(err) })
      return { scanned: candidates.length, updated: 0, bumped: 0, errors }
    }
    try {
      // Only chase pending invites by email — the `invitations` table is keyed
      // off email; people who haven't accepted yet have no slack_user_id.
      const missing = allEmails.filter((e) => !byEmail.has(e))
      pending = missing.length > 0 ? await lookupPendingInvitesByEmails(missing) : pending
    } catch (err) {
      errors.push({
        stage: "pending-invites",
        message: err instanceof Error ? err.message : String(err),
      })
      // continue: we can still apply participant updates even if invites query failed
    }

    // Compute desired diff per candidate.
    const now = new Date()
    let updated = 0
    let bumped = 0
    const cacheOnlyIds: string[] = []

    // Process in chunks of ~25 inside transactions so a single failure doesn't
    // roll back the whole sweep.
    const CHUNK = 25
    for (let i = 0; i < candidates.length; i += CHUNK) {
      const chunk = candidates.slice(i, i + CHUNK)
      try {
        await prisma.$transaction(async (tx) => {
          for (const c of chunk) {
            try {
              // Try email first (primary key for most candidates), then fall
              // back to Slack ID — covers users whose Stasis email differs
              // from the email they registered on Attend with.
              const attend =
                (c.email ? byEmail.get(c.email) : undefined) ??
                (c.slackId ? bySlackId.get(c.slackId) : undefined)
              const invite = c.email ? pending.get(c.email) : undefined

              const desired: DesiredFields = {}

              if (attend?.found) {
                desired.attendInvited = true
                desired.attendOnboardingStarted = true
                desired.attendStatus = attend.status ?? null
                desired.attendFlightBooked = !!attend.hasFlight
                desired.attendCity = attend.city ?? null
                desired.attendState = attend.state ?? null
                desired.attendCountry = attend.country ?? null
              } else if (invite) {
                desired.attendInvited = true
                desired.attendOnboardingStarted = false
                desired.attendStatus = "invited"
                desired.attendFlightBooked = false
                // leave city/state/country alone — invitation row has no location
              } else {
                // Not in participants nor pending invitations. Don't clobber
                // attendInvited (the invite-attend route is the source of
                // truth for "we sent it"); clear the rest.
                desired.attendOnboardingStarted = false
                desired.attendStatus = null
                desired.attendFlightBooked = false
                desired.attendCity = null
                desired.attendState = null
                desired.attendCountry = null
              }

              // Stamp invitedAt on first transition.
              const sourceInvitedAt = attend?.found
                ? (attend.invitedAt ? new Date(attend.invitedAt) : now)
                : invite?.invitedAt ?? null
              if (!c.invitedAt && sourceInvitedAt) {
                desired.invitedAt = sourceInvitedAt
              }

              // Transition-based auto-bumps. Each fires only on the
              // false→true transition so users can manually move someone
              // back without the sync re-bumping them on every run.
              const wasInAttend = c.attendInvited || c.attendOnboardingStarted
              const isInAttend = !!attend?.found || !!invite
              const newlyInAttend = !wasInAttend && isInAttend

              const wasFlightBooked = c.attendFlightBooked
              const isFlightBooked = !!attend?.hasFlight
              const newlyFlightBooked = !wasFlightBooked && isFlightBooked

              const BUMP_FROM_FOR_FLIGHT = new Set([
                "IDENTIFIED", "CONTACTED", "SOFT_YES", "CONFIRMED_YES",
              ])
              let bumpFrom: string | null = null
              let bumpTo: string | null = null
              if (newlyFlightBooked && BUMP_FROM_FOR_FLIGHT.has(c.outreachStatus)) {
                bumpFrom = c.outreachStatus
                bumpTo = "BOOKED_FLIGHT"
              } else if (newlyInAttend && c.outreachStatus === "IDENTIFIED") {
                bumpFrom = "IDENTIFIED"
                bumpTo = "CONTACTED"
              }
              if (bumpTo) {
                desired.outreachStatus = bumpTo
                if (!c.invitedAt && !desired.invitedAt) {
                  desired.invitedAt = sourceInvitedAt ?? now
                }
              }

              // Diff-only write
              const data: Record<string, unknown> = {}
              if (desired.attendInvited !== undefined && desired.attendInvited !== c.attendInvited) {
                data.attendInvited = desired.attendInvited
              }
              if (desired.attendOnboardingStarted !== undefined && desired.attendOnboardingStarted !== c.attendOnboardingStarted) {
                data.attendOnboardingStarted = desired.attendOnboardingStarted
              }
              if (desired.attendFlightBooked !== undefined && desired.attendFlightBooked !== c.attendFlightBooked) {
                data.attendFlightBooked = desired.attendFlightBooked
              }
              if (desired.attendStatus !== undefined && desired.attendStatus !== c.attendStatus) {
                data.attendStatus = desired.attendStatus
              }
              if (desired.attendCity !== undefined && desired.attendCity !== c.attendCity) {
                data.attendCity = desired.attendCity
              }
              if (desired.attendState !== undefined && desired.attendState !== c.attendState) {
                data.attendState = desired.attendState
              }
              if (desired.attendCountry !== undefined && desired.attendCountry !== c.attendCountry) {
                data.attendCountry = desired.attendCountry
              }
              if (desired.invitedAt && !c.invitedAt) {
                data.invitedAt = desired.invitedAt
              }
              if (desired.outreachStatus && desired.outreachStatus !== c.outreachStatus) {
                data.outreachStatus = desired.outreachStatus
              }

              if (Object.keys(data).length === 0) {
                cacheOnlyIds.push(c.id)
                continue
              }

              data.attendCachedAt = now
              await tx.attendanceCandidate.update({ where: { id: c.id }, data })

              if (bumpFrom && bumpTo) {
                await tx.attendanceAuditEntry.create({
                  data: {
                    candidateId: c.id,
                    actorId: null,
                    field: "outreachStatus",
                    oldValue: bumpFrom,
                    newValue: bumpTo,
                  },
                })
                bumped += 1
              }
              updated += 1
            } catch (err) {
              if (errors.length < 50) {
                errors.push({
                  candidateId: c.id,
                  stage: "write",
                  message: err instanceof Error ? err.message : String(err),
                })
              }
            }
          }
        })
      } catch (err) {
        if (errors.length < 50) {
          errors.push({
            stage: "tx",
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }

    // Bump attendCachedAt for the cache-only rows via raw SQL so updatedAt
    // doesn't churn (would distort the dashboard secondary sort).
    if (cacheOnlyIds.length > 0) {
      try {
        await prisma.$executeRaw`
          UPDATE attendance_candidate
             SET "attendCachedAt" = ${now}
           WHERE id = ANY(${cacheOnlyIds}::text[])
        `
      } catch (err) {
        errors.push({
          stage: "cache-stamp",
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return { scanned: candidates.length, updated, bumped, errors }
  } finally {
    if (isFullSweep) {
      await prisma.$queryRaw`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY}::bigint)`.catch(() => {})
    }
  }
}

export async function syncOneCandidateAgainstAttend(
  prisma: PrismaClient,
  candidateId: string,
  actorLabel: "cron" | "manual" | "invite"
): Promise<AttendSyncSummary> {
  return syncCandidatesAgainstAttend(prisma, { candidateIds: [candidateId], actorLabel })
}

export interface AttendImportSummary {
  created: number
  skippedExisting: number
  attendParticipants: number
  attendPendingInvites: number
  errors: Array<{ stage: string; message: string }>
}

/**
 * Pull every Stasis-event participant + invitation from the Attend platform DB
 * and create AttendanceCandidate rows for any that aren't already tracked.
 * Idempotent on userId / externalEmail. Used by /sync-all so admins don't
 * have to manually invoke a separate "backfill" endpoint when new people
 * appear in Attend.
 */
export async function importNewAttendCandidates(
  prisma: PrismaClient
): Promise<AttendImportSummary> {
  const errors: AttendImportSummary["errors"] = []
  const pool = getAttendPool()
  if (!pool) {
    return { created: 0, skippedExisting: 0, attendParticipants: 0, attendPendingInvites: 0, errors: [{ stage: "env", message: "READONLY_ATTEND_DATABASE_URL not set" }] }
  }

  let participants: Array<{
    email: string; legal_first_name: string; legal_last_name: string;
    preferred_name: string | null; pronouns: string | null;
    city: string | null; state: string | null; country: string | null;
    slack_user_id: string | null; status: string; created_at: Date; pe_id: string;
    has_flight: boolean
  }> = []
  let invitations: Array<{ email: string; created_at: Date; accepted_at: Date | null }> = []
  try {
    const [pRes, iRes] = await Promise.all([
      pool.query<typeof participants[number]>(
        `SELECT lower(p.email) AS email,
                p.legal_first_name, p.legal_last_name, p.preferred_name,
                p.pronouns, p.city, p.state, p.country_of_residence AS country,
                p.slack_user_id,
                pe.status, pe.created_at, pe.id AS pe_id,
                EXISTS (
                  SELECT 1
                    FROM travels t
                    JOIN travel_legs tl ON tl.travel_id = t.id
                   WHERE t.participant_event_id = pe.id
                     AND t.direction = 'inbound'
                     AND (tl.flight_code IS NOT NULL OR tl.confirmation_code IS NOT NULL)
                ) AS has_flight
           FROM participants p
           JOIN participant_events pe ON pe.participant_id = p.id
          WHERE pe.event_id = $1`,
        [STASIS_EVENT_ID]
      ),
      pool.query<typeof invitations[number]>(
        `SELECT lower(email) AS email, created_at, accepted_at
           FROM invitations
          WHERE event_id = $1`,
        [STASIS_EVENT_ID]
      ),
    ])
    participants = pRes.rows
    invitations = iRes.rows
  } catch (err) {
    return {
      created: 0, skippedExisting: 0, attendParticipants: 0, attendPendingInvites: 0,
      errors: [{ stage: "lookup", message: err instanceof Error ? err.message : String(err) }],
    }
  }

  const participantEmails = new Set(participants.map((r) => r.email))
  const inviteOnly = invitations.filter((i) => !participantEmails.has(i.email))
  const allEmails = [...participants.map((r) => r.email), ...inviteOnly.map((i) => i.email)]
  const participantSlackIds = participants.map((r) => r.slack_user_id).filter((s): s is string => !!s)
  if (allEmails.length === 0) {
    return { created: 0, skippedExisting: 0, attendParticipants: 0, attendPendingInvites: 0, errors }
  }

  // Match Stasis users by email OR slackId. The Slack-ID fallback catches
  // users whose Attend registration email differs from their Stasis account
  // email (different gmail alias, work vs personal, etc.) — without it, the
  // importer creates a duplicate "external" candidate alongside their real
  // user-linked one.
  const stasisUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { in: allEmails, mode: "insensitive" } },
        ...(participantSlackIds.length > 0 ? [{ slackId: { in: participantSlackIds } }] : []),
      ],
    },
    select: { id: true, email: true, slackId: true, attendRegisteredAt: true },
  })
  const userByEmail = new Map(stasisUsers.map((u) => [u.email.toLowerCase(), u]))
  const userBySlackId = new Map(
    stasisUsers.filter((u) => u.slackId).map((u) => [u.slackId!, u])
  )

  const existingByUserId = new Set(
    (await prisma.attendanceCandidate.findMany({
      where: { userId: { in: stasisUsers.map((u) => u.id) } },
      select: { userId: true },
    })).map((c) => c.userId!)
  )
  const existingByExternalEmail = new Set(
    (await prisma.attendanceCandidate.findMany({
      where: { externalEmail: { in: allEmails } },
      select: { externalEmail: true },
    })).map((c) => c.externalEmail!.toLowerCase())
  )

  const now = new Date()
  let created = 0
  let skippedExisting = 0

  // Participants
  for (const r of participants) {
    const user =
      userByEmail.get(r.email) ??
      (r.slack_user_id ? userBySlackId.get(r.slack_user_id) : undefined)
    const userId = user?.id ?? null
    if (userId && existingByUserId.has(userId)) { skippedExisting += 1; continue }
    if (existingByExternalEmail.has(r.email)) { skippedExisting += 1; continue }
    const composedName = (r.preferred_name?.trim()) || `${r.legal_first_name} ${r.legal_last_name}`.trim()
    const isGirl = r.pronouns && /she\/her/i.test(r.pronouns) ? true : null
    try {
      await prisma.attendanceCandidate.create({
        data: {
          ...(userId
            ? { user: { connect: { id: userId } } }
            : { externalName: composedName, externalEmail: r.email, externalSlackId: r.slack_user_id }),
          outreachStatus: r.has_flight ? "BOOKED_FLIGHT" : "CONTACTED",
          source: "DISCRETION",
          isGirl,
          invitedAt: r.created_at,
          attendInvited: true,
          attendOnboardingStarted: true,
          attendStatus: r.status,
          attendFlightBooked: r.has_flight,
          attendCity: r.city,
          attendState: r.state,
          attendCountry: r.country,
          homeCity: r.city,
          attendCachedAt: now,
        },
      })
      if (userId && !user?.attendRegisteredAt) {
        await prisma.user.update({ where: { id: userId }, data: { attendRegisteredAt: now } })
      }
      created += 1
    } catch (err) {
      if (errors.length < 50) {
        errors.push({ stage: "create-participant", message: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  // Pending invites
  for (const inv of inviteOnly) {
    const user = userByEmail.get(inv.email)
    const userId = user?.id ?? null
    if (userId && existingByUserId.has(userId)) { skippedExisting += 1; continue }
    if (existingByExternalEmail.has(inv.email)) { skippedExisting += 1; continue }
    try {
      await prisma.attendanceCandidate.create({
        data: {
          ...(userId
            ? { user: { connect: { id: userId } } }
            : { externalName: inv.email.split("@")[0], externalEmail: inv.email }),
          outreachStatus: "CONTACTED",
          source: "DISCRETION",
          invitedAt: inv.created_at,
          attendInvited: true,
          attendOnboardingStarted: false,
          attendStatus: "invited",
          attendFlightBooked: false,
          attendCachedAt: now,
        },
      })
      if (userId && !user?.attendRegisteredAt) {
        await prisma.user.update({ where: { id: userId }, data: { attendRegisteredAt: now } })
      }
      created += 1
    } catch (err) {
      if (errors.length < 50) {
        errors.push({ stage: "create-pending", message: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  return {
    created,
    skippedExisting,
    attendParticipants: participants.length,
    attendPendingInvites: inviteOnly.length,
    errors,
  }
}
