import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { getAttendPool, STASIS_EVENT_ID } from "@/lib/attend-db"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * POST /api/admin/attendance/backfill-from-attend
 *
 * One-shot import of every Stasis-event participant + pending invitation
 * from the Attend platform DB into AttendanceCandidate. Idempotent on
 * userId / externalEmail (skips existing candidates rather than duplicating).
 *
 * Body: { dryRun?: boolean }   default false
 *
 * Mirrors `scripts/sync-attend-candidates.ts` but as an admin HTTP endpoint —
 * no shell access needed.
 */
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission(Permission.MANAGE_ATTENDANCE)
  if (authCheck.error) return authCheck.error

  const pool = getAttendPool()
  if (!pool) {
    return NextResponse.json(
      { error: "READONLY_ATTEND_DATABASE_URL not set" },
      { status: 503 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const dryRun = !!body.dryRun

  // 1. Pull Attend rows
  const [participantsRes, invitationsRes] = await Promise.all([
    pool.query<{
      email: string
      legal_first_name: string
      legal_last_name: string
      preferred_name: string | null
      pronouns: string | null
      city: string | null
      state: string | null
      country: string | null
      slack_user_id: string | null
      status: string
      created_at: Date
      pe_id: string
      has_flight: boolean
    }>(
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
        WHERE pe.event_id = $1
        ORDER BY pe.created_at`,
      [STASIS_EVENT_ID]
    ),
    pool.query<{ email: string; created_at: Date; accepted_at: Date | null }>(
      `SELECT lower(email) AS email, created_at, accepted_at
         FROM invitations
        WHERE event_id = $1
        ORDER BY created_at`,
      [STASIS_EVENT_ID]
    ),
  ])

  const participantEmails = new Set(participantsRes.rows.map((r) => r.email))
  const inviteOnly = invitationsRes.rows.filter((i) => !participantEmails.has(i.email))

  const allEmails = [
    ...participantsRes.rows.map((r) => r.email),
    ...inviteOnly.map((i) => i.email),
  ]

  // 2. Resolve to existing Stasis users
  const stasisUsers = await prisma.user.findMany({
    where: { email: { in: allEmails, mode: "insensitive" } },
    select: { id: true, email: true, attendRegisteredAt: true },
  })
  const userByEmail = new Map(stasisUsers.map((u) => [u.email.toLowerCase(), u]))

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

  let toCreateParticipants = 0
  let toCreatePending = 0
  let skippedExisting = 0
  let usersToStamp = 0
  const sample: Array<{ email: string; outcome: string; status: string }> = []

  // 3. Plan participant rows
  const plannedParticipants: Array<{
    email: string
    userId: string | null
    composedName: string
    isGirl: boolean | null
    invitedAt: Date
    attendStatus: string
    attendFlightBooked: boolean
    attendCity: string | null
    attendState: string | null
    attendCountry: string | null
    slackId: string | null
    needsUserStamp: boolean
  }> = []
  for (const r of participantsRes.rows) {
    const user = userByEmail.get(r.email)
    const userId = user?.id ?? null
    if (userId && existingByUserId.has(userId)) {
      skippedExisting += 1
      if (sample.length < 20) sample.push({ email: r.email, outcome: "skip (linked exists)", status: r.status })
      continue
    }
    if (!userId && existingByExternalEmail.has(r.email)) {
      skippedExisting += 1
      if (sample.length < 20) sample.push({ email: r.email, outcome: "skip (external exists)", status: r.status })
      continue
    }
    const composedName = (r.preferred_name?.trim()) || `${r.legal_first_name} ${r.legal_last_name}`.trim()
    const isGirl = r.pronouns && /she\/her/i.test(r.pronouns) ? true : null
    plannedParticipants.push({
      email: r.email,
      userId,
      composedName,
      isGirl,
      invitedAt: r.created_at,
      attendStatus: r.status,
      attendFlightBooked: r.has_flight,
      attendCity: r.city,
      attendState: r.state,
      attendCountry: r.country,
      slackId: r.slack_user_id,
      needsUserStamp: !!userId && !user?.attendRegisteredAt,
    })
    toCreateParticipants += 1
    if (plannedParticipants[plannedParticipants.length - 1].needsUserStamp) usersToStamp += 1
    if (sample.length < 20) sample.push({ email: r.email, outcome: `create ${userId ? "linked" : "external"}`, status: r.status })
  }

  // 4. Plan pending-invite rows
  const plannedPending: Array<{
    email: string
    userId: string | null
    fallbackName: string
    invitedAt: Date
    needsUserStamp: boolean
  }> = []
  for (const p of inviteOnly) {
    const user = userByEmail.get(p.email)
    const userId = user?.id ?? null
    if (userId && existingByUserId.has(userId)) {
      skippedExisting += 1
      if (sample.length < 20) sample.push({ email: p.email, outcome: "skip (linked exists)", status: "pending" })
      continue
    }
    if (!userId && existingByExternalEmail.has(p.email)) {
      skippedExisting += 1
      if (sample.length < 20) sample.push({ email: p.email, outcome: "skip (external exists)", status: "pending" })
      continue
    }
    plannedPending.push({
      email: p.email,
      userId,
      fallbackName: p.email.split("@")[0],
      invitedAt: p.created_at,
      needsUserStamp: !!userId && !user?.attendRegisteredAt,
    })
    toCreatePending += 1
    if (plannedPending[plannedPending.length - 1].needsUserStamp) usersToStamp += 1
    if (sample.length < 20) sample.push({ email: p.email, outcome: `create ${userId ? "linked" : "external"}`, status: "pending" })
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      attendParticipants: participantsRes.rows.length,
      attendPendingInvites: inviteOnly.length,
      stasisUsersMatched: stasisUsers.length,
      toCreateParticipants,
      toCreatePending,
      skippedExisting,
      usersToStamp,
      sample,
    })
  }

  // 5. Apply writes
  const now = new Date()
  let created = 0
  for (const p of plannedParticipants) {
    await prisma.attendanceCandidate.create({
      data: {
        ...(p.userId
          ? { user: { connect: { id: p.userId } } }
          : {
              externalName: p.composedName,
              externalEmail: p.email,
              externalSlackId: p.slackId,
            }),
        outreachStatus: p.attendFlightBooked ? "CONFIRMED_YES" : "CONTACTED",
        source: "DISCRETION",
        isGirl: p.isGirl,
        invitedAt: p.invitedAt,
        attendInvited: true,
        attendOnboardingStarted: true,
        attendStatus: p.attendStatus,
        attendFlightBooked: p.attendFlightBooked,
        attendCity: p.attendCity,
        attendState: p.attendState,
        attendCountry: p.attendCountry,
        homeCity: p.attendCity,
        attendCachedAt: now,
      },
    })
    if (p.needsUserStamp && p.userId) {
      await prisma.user.update({
        where: { id: p.userId },
        data: { attendRegisteredAt: now },
      })
    }
    created += 1
  }
  for (const p of plannedPending) {
    await prisma.attendanceCandidate.create({
      data: {
        ...(p.userId
          ? { user: { connect: { id: p.userId } } }
          : { externalName: p.fallbackName, externalEmail: p.email }),
        outreachStatus: "CONTACTED",
        source: "DISCRETION",
        invitedAt: p.invitedAt,
        attendInvited: true,
        attendOnboardingStarted: false,
        attendStatus: "invited",
        attendFlightBooked: false,
        attendCachedAt: now,
      },
    })
    if (p.needsUserStamp && p.userId) {
      await prisma.user.update({
        where: { id: p.userId },
        data: { attendRegisteredAt: now },
      })
    }
    created += 1
  }

  return NextResponse.json({
    dryRun: false,
    attendParticipants: participantsRes.rows.length,
    attendPendingInvites: inviteOnly.length,
    stasisUsersMatched: stasisUsers.length,
    created,
    skippedExisting,
    usersStamped: usersToStamp,
    sample,
  })
}
