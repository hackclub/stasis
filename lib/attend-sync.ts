import type { PrismaClient } from "@/app/generated/prisma/client"
import { lookupAttendByEmails, lookupPendingInvitesByEmails, getAttendPool, type AttendStatus } from "./attend-db"

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
  email: string
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
        user: { select: { email: true } },
      },
    })

    const candidates: SyncRow[] = raw
      .map((c): SyncRow | null => {
        const email = c.user?.email ?? c.externalEmail ?? null
        if (!email) return null
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
          email: email.toLowerCase(),
        }
      })
      .filter((x): x is SyncRow => x !== null)

    if (candidates.length === 0) {
      return { scanned: 0, updated: 0, bumped: 0, errors }
    }

    const allEmails = Array.from(new Set(candidates.map((c) => c.email)))

    // Two batched lookups in parallel against the Attend replica.
    let participants = new Map<string, AttendStatus>()
    let pending = new Map<string, { invitedAt: Date; acceptedAt: Date | null }>()
    try {
      participants = await lookupAttendByEmails(allEmails)
    } catch (err) {
      errors.push({ stage: "lookup", message: err instanceof Error ? err.message : String(err) })
      return { scanned: candidates.length, updated: 0, bumped: 0, errors }
    }
    try {
      const missing = allEmails.filter((e) => !participants.has(e))
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
              const attend = participants.get(c.email)
              const invite = pending.get(c.email)

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

              // Auto-bump from sourcing.
              const willAutoBump = !!attend?.found && c.outreachStatus === "IDENTIFIED"
              if (willAutoBump) {
                desired.outreachStatus = "CONTACTED"
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

              if (willAutoBump) {
                await tx.attendanceAuditEntry.create({
                  data: {
                    candidateId: c.id,
                    actorId: null,
                    field: "outreachStatus",
                    oldValue: "IDENTIFIED",
                    newValue: "CONTACTED",
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
