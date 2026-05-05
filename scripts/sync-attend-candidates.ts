/**
 * One-time-ish backfill: pull every Stasis-event participant from prod Attend
 * and create AttendanceCandidate rows for them locally. Idempotent (skips
 * candidates that already exist by userId or externalEmail).
 *
 * Run with:
 *   yarn tsx scripts/sync-attend-candidates.ts
 *
 * Env required:
 *   DATABASE_URL                       (local destination)
 *   READONLY_ATTEND_DATABASE_URL       (prod attend source)
 */
import 'dotenv/config'
import { Pool } from 'pg'
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const STASIS_EVENT_ID = '1fc52885-013a-4114-84f8-d44a0cf33c0d'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const attendPool = new Pool({
  connectionString: process.env.READONLY_ATTEND_DATABASE_URL!,
  max: 4,
  connectionTimeoutMillis: 5_000,
})

interface AttendRow {
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
}

interface PendingInviteRow {
  email: string
  created_at: Date
}

async function pullPendingInvites(): Promise<PendingInviteRow[]> {
  const { rows } = await attendPool.query<PendingInviteRow>(
    `SELECT lower(email) AS email, created_at
       FROM invitations
      WHERE event_id = $1
        AND accepted_at IS NULL
      ORDER BY created_at`,
    [STASIS_EVENT_ID]
  )
  return rows
}

async function pullAttendRows(): Promise<AttendRow[]> {
  const { rows } = await attendPool.query<AttendRow>(
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
  )
  return rows
}

function composeName(r: AttendRow): string {
  if (r.preferred_name && r.preferred_name.trim()) {
    return r.preferred_name.trim()
  }
  return `${r.legal_first_name} ${r.legal_last_name}`.trim()
}

function deriveIsGirl(pronouns: string | null): boolean | null {
  if (!pronouns) return null
  if (/she\/her/i.test(pronouns)) return true
  return null
}

async function main() {
  console.log('Pulling Attend participants + pending invitations for Stasis event…')
  const [attendRows, pendingInvites] = await Promise.all([
    pullAttendRows(),
    pullPendingInvites(),
  ])
  console.log(`  Found ${attendRows.length} participants (started onboarding)`)
  console.log(`  Found ${pendingInvites.length} pending invitations (no participant row yet)`)

  // De-dupe: a pending invite for an email that ALSO has a participant row
  // is just the original invitation that was accepted — skip it (the participant
  // row carries the richer data).
  const participantEmails = new Set(attendRows.map((r) => r.email))
  const pendingOnly = pendingInvites.filter((i) => !participantEmails.has(i.email))
  console.log(`  Pending-only (truly haven't started): ${pendingOnly.length}`)

  const allEmails = [...attendRows.map((r) => r.email), ...pendingOnly.map((p) => p.email)]
  const stasisUsers = await prisma.user.findMany({
    where: { email: { in: allEmails, mode: 'insensitive' } },
    select: { id: true, email: true, attendRegisteredAt: true },
  })
  const userByEmail = new Map(stasisUsers.map((u) => [u.email.toLowerCase(), u]))
  console.log(`  Matched ${stasisUsers.length}/${allEmails.length} to Stasis users`)

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

  let created = 0
  let skippedExisting = 0
  let usersStamped = 0
  const summary: Array<{ email: string; outcome: string; status: string }> = []

  for (const r of attendRows) {
    const matchedUser = userByEmail.get(r.email)
    const userId = matchedUser?.id ?? null

    if (userId && existingByUserId.has(userId)) {
      skippedExisting += 1
      summary.push({ email: r.email, outcome: 'skip (userId)', status: r.status })
      continue
    }
    if (!userId && existingByExternalEmail.has(r.email)) {
      skippedExisting += 1
      summary.push({ email: r.email, outcome: 'skip (externalEmail)', status: r.status })
      continue
    }

    // Booked flight → CONFIRMED_YES (which renders as Booked Flight via kanban virtual column)
    // Otherwise → CONTACTED (Reached out)
    const outreachStatus = r.has_flight ? 'CONFIRMED_YES' : 'CONTACTED'
    const isGirl = deriveIsGirl(r.pronouns)
    const composedName = composeName(r)

    await prisma.attendanceCandidate.create({
      data: {
        ...(userId
          ? { user: { connect: { id: userId } } }
          : {
              externalName: composedName,
              externalEmail: r.email,
              externalSlackId: r.slack_user_id ?? null,
            }),
        outreachStatus,
        source: 'DISCRETION',
        isGirl,
        invitedAt: r.created_at,
        attendInvited: true,
        attendOnboardingStarted: true,  // they have a participant row → started
        attendFlightBooked: r.has_flight,
        attendCity: r.city,
        attendState: r.state,
        attendCountry: r.country,
        homeCity: r.city,  // mirror so kanban shows location without re-sync
        attendCachedAt: new Date(),
      },
    })
    created += 1

    if (userId && !matchedUser?.attendRegisteredAt) {
      await prisma.user.update({
        where: { id: userId },
        data: { attendRegisteredAt: new Date() },
      })
      usersStamped += 1
    }

    summary.push({ email: r.email, outcome: `create (${userId ? 'linked' : 'external'})`, status: r.status })
  }

  // Pending invitations — no participant row yet, so all we have is email + created_at.
  // Drop them in 'Reached out' with attendInvited=true so the dashboard reflects
  // they've been invited but haven't started onboarding.
  for (const p of pendingOnly) {
    const matchedUser = userByEmail.get(p.email)
    const userId = matchedUser?.id ?? null

    if (userId && existingByUserId.has(userId)) {
      skippedExisting += 1
      summary.push({ email: p.email, outcome: 'skip (userId)', status: 'pending' })
      continue
    }
    if (!userId && existingByExternalEmail.has(p.email)) {
      skippedExisting += 1
      summary.push({ email: p.email, outcome: 'skip (externalEmail)', status: 'pending' })
      continue
    }

    await prisma.attendanceCandidate.create({
      data: {
        ...(userId
          ? { user: { connect: { id: userId } } }
          : {
              // No name available — fall back to email's local-part as a placeholder
              externalName: p.email.split('@')[0],
              externalEmail: p.email,
            }),
        outreachStatus: 'CONTACTED',
        source: 'DISCRETION',
        invitedAt: p.created_at,
        attendInvited: true,
        attendOnboardingStarted: false,  // invitation only, no participant row yet
        attendFlightBooked: false,
        attendCachedAt: new Date(),
      },
    })
    created += 1

    if (userId && !matchedUser?.attendRegisteredAt) {
      await prisma.user.update({
        where: { id: userId },
        data: { attendRegisteredAt: new Date() },
      })
      usersStamped += 1
    }

    summary.push({ email: p.email, outcome: `create (${userId ? 'linked' : 'external'})`, status: 'pending' })
  }

  console.log('\n--- summary ---')
  for (const s of summary) {
    console.log(`  ${s.outcome.padEnd(22)} [${s.status.padEnd(17)}] ${s.email}`)
  }
  console.log(`\nCreated: ${created}`)
  console.log(`Skipped (already existed): ${skippedExisting}`)
  console.log(`User.attendRegisteredAt stamped: ${usersStamped}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => {
    await prisma.$disconnect()
    await attendPool.end()
  })
