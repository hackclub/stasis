import { Pool } from 'pg'

/**
 * Read-only connection to the Attend database (the platform that powers
 * attend.hackclub.com). We never write to it. Used by the attendance
 * dashboard to surface travel status, invitation status, dietary, etc.
 *
 * Set READONLY_ATTEND_DATABASE_URL in env. Without it, all helpers below
 * resolve to "unknown" rather than throwing — the dashboard remains usable.
 */

let pool: Pool | null = null

export function getAttendPool(): Pool | null {
  const url = process.env.READONLY_ATTEND_DATABASE_URL
  if (!url) return null
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
  }
  return pool
}

// Stasis event UUID in the Attend DB. Pinned because it is stable.
export const STASIS_EVENT_ID = '1fc52885-013a-4114-84f8-d44a0cf33c0d'

export interface AttendStatus {
  found: boolean
  participantId?: string
  participantEventId?: string
  status?: string                       // invited, confirmed, checked_in, declined, etc.
  invitedAt?: string | null
  confirmedAt?: string | null
  checkedInAt?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  pronouns?: string | null
  tshirtSize?: string | null
  travel?: {
    inbound?: AttendTravelLeg | null
    outbound?: AttendTravelLeg | null
    visaRequired?: boolean | null
    visaStatus?: string | null
  }
  hasFlight?: boolean
}

export interface AttendTravelLeg {
  mode: string | null
  carrier: string | null
  flightCode: string | null
  confirmationCode: string | null
  departureAirport: string | null
  arrivalAirport: string | null
  departureTime: string | null
  arrivalTime: string | null
}

/**
 * Look up Attend status for one or more emails. Returns a map keyed by
 * lowercased email. Missing emails are simply absent from the map.
 */
export async function lookupAttendByEmails(
  emails: string[]
): Promise<Map<string, AttendStatus>> {
  const result = new Map<string, AttendStatus>()
  const pool = getAttendPool()
  if (!pool || emails.length === 0) return result

  const lowered = Array.from(new Set(emails.map((e) => e.toLowerCase()).filter(Boolean)))
  if (lowered.length === 0) return result

  const { rows } = await pool.query<{
    email: string
    participant_id: string
    participant_event_id: string
    status: string
    created_at: string
    onboarding_completed_at: string | null
    checked_in_at: string | null
    city: string | null
    state: string | null
    country: string | null
    pronouns: string | null
    tshirt_size: string | null
  }>(
    `SELECT lower(p.email) AS email, p.id AS participant_id, pe.id AS participant_event_id,
            pe.status, pe.created_at, pe.onboarding_completed_at, pe.checked_in_at,
            p.city, p.state, p.country_of_residence AS country, p.pronouns, p.tshirt_size
       FROM participants p
       JOIN participant_events pe ON pe.participant_id = p.id
      WHERE pe.event_id = $1
        AND lower(p.email) = ANY($2::text[])`,
    [STASIS_EVENT_ID, lowered]
  )

  if (rows.length === 0) return result

  // Travel data for these participant_events (inbound/outbound)
  const peIds = rows.map((r) => r.participant_event_id)
  const travels = await pool.query<{
    participant_event_id: string
    direction: string
    visa_required: boolean | null
    visa_status: string | null
    travel_id: string
    flight_code: string | null
    confirmation_code: string | null
    departure_airport: string | null
    arrival_airport: string | null
    departure_time: string | null
    arrival_time: string | null
    mode: string | null
    carrier: string | null
  }>(
    `SELECT t.participant_event_id, t.direction, t.visa_required, t.visa_status, t.id AS travel_id,
            t.mode, t.carrier,
            tl.flight_code, tl.confirmation_code, tl.departure_airport, tl.arrival_airport,
            tl.departure_time, tl.arrival_time
       FROM travels t
       LEFT JOIN LATERAL (
         SELECT * FROM travel_legs
          WHERE travel_id = t.id
          ORDER BY position ASC NULLS LAST, departure_time ASC NULLS LAST
          LIMIT 1
       ) tl ON true
      WHERE t.participant_event_id = ANY($1::uuid[])`,
    [peIds]
  )

  const travelByPe = new Map<string, AttendStatus['travel']>()
  for (const t of travels.rows) {
    const existing = travelByPe.get(t.participant_event_id) ?? {
      visaRequired: null,
      visaStatus: null,
      inbound: null,
      outbound: null,
    }
    if (t.visa_required != null) existing.visaRequired = t.visa_required
    if (t.visa_status) existing.visaStatus = t.visa_status
    const leg: AttendTravelLeg = {
      mode: t.mode,
      carrier: t.carrier,
      flightCode: t.flight_code,
      confirmationCode: t.confirmation_code,
      departureAirport: t.departure_airport,
      arrivalAirport: t.arrival_airport,
      departureTime: t.departure_time,
      arrivalTime: t.arrival_time,
    }
    if (t.direction === 'inbound') existing.inbound = leg
    else if (t.direction === 'outbound') existing.outbound = leg
    travelByPe.set(t.participant_event_id, existing)
  }

  for (const r of rows) {
    const travel = travelByPe.get(r.participant_event_id)
    const hasFlight =
      !!(travel?.inbound?.confirmationCode || travel?.inbound?.flightCode)
    result.set(r.email, {
      found: true,
      participantId: r.participant_id,
      participantEventId: r.participant_event_id,
      status: r.status,
      invitedAt: r.created_at,
      confirmedAt: r.onboarding_completed_at,
      checkedInAt: r.checked_in_at,
      city: r.city,
      state: r.state,
      country: r.country,
      pronouns: r.pronouns,
      tshirtSize: r.tshirt_size,
      travel: travel ?? undefined,
      hasFlight,
    })
  }
  return result
}

export async function lookupAttendByEmail(email: string): Promise<AttendStatus | null> {
  const map = await lookupAttendByEmails([email])
  return map.get(email.toLowerCase()) ?? null
}

/**
 * Invitations for the Stasis event keyed by lowercased email. Returns rows
 * for both un-accepted (`accepted_at IS NULL`) and accepted-but-stuck invites
 * — the latter happens when someone clicks the invite link but never
 * completes onboarding, leaving an accepted invitation row with no
 * corresponding participant_events row. Used by the sync job to surface
 * "we sent them a link" state when they aren't in `participants`.
 */
export async function lookupPendingInvitesByEmails(
  emails: string[]
): Promise<Map<string, { invitedAt: Date; acceptedAt: Date | null }>> {
  const result = new Map<string, { invitedAt: Date; acceptedAt: Date | null }>()
  const pool = getAttendPool()
  if (!pool || emails.length === 0) return result

  const lowered = Array.from(new Set(emails.map((e) => e.toLowerCase()).filter(Boolean)))
  if (lowered.length === 0) return result

  const { rows } = await pool.query<{ email: string; created_at: Date; accepted_at: Date | null }>(
    `SELECT lower(email) AS email, created_at, accepted_at
       FROM invitations
      WHERE event_id = $1
        AND lower(email) = ANY($2::text[])`,
    [STASIS_EVENT_ID, lowered]
  )
  for (const r of rows) {
    // If multiple invitations exist for one email (re-invites), keep the most
    // recent one — the older ones are superseded.
    const existing = result.get(r.email)
    if (!existing || r.created_at > existing.invitedAt) {
      result.set(r.email, { invitedAt: r.created_at, acceptedAt: r.accepted_at })
    }
  }
  return result
}
