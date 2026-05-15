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
  email?: string | null                 // lowercased participant email — for cross-key reconciliation
  slackUserId?: string | null           // Attend's record of the participant's Slack ID
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

/**
 * One direction of a candidate's travel (inbound or outbound). Combines
 * fields from `travels` (mode-agnostic — bus locations, train stations, car
 * origin address, "other" details, visa info) with the first
 * `travel_legs` row (flight-specific — flight_code, confirmation, airports).
 *
 * Different `mode` values populate different field sets:
 *   - flight  → flightCode, confirmationCode, departureAirport, arrivalAirport
 *   - train   → trainDepartureStation, trainArrivalStation, departureStation,
 *               arrivalStation, departureCity, arrivalCity
 *   - bus     → busDepartureLocation, busArrivalLocation, carrier
 *   - car     → originAddress, departureCity, arrivalCity
 *   - other   → otherDetails, notes
 *
 * UI should treat any non-null field as displayable rather than hard-coding
 * per-mode rendering.
 */
export interface AttendTravelLeg {
  mode: string | null
  carrier: string | null
  notes: string | null

  // Times — `travels` row carries them for non-flight modes; `travel_legs`
  // carries them for flights. Code below merges leg-level times into the
  // top-level fields when present.
  departureTime: string | null
  arrivalTime: string | null
  expectedArrivalTime: string | null

  // Flight
  flightNumber: string | null
  flightCode: string | null
  confirmationCode: string | null
  departureAirport: string | null
  arrivalAirport: string | null

  // Train
  trainDepartureStation: string | null
  trainArrivalStation: string | null
  departureStation: string | null
  arrivalStation: string | null
  departureCity: string | null
  arrivalCity: string | null

  // Bus
  busDepartureLocation: string | null
  busArrivalLocation: string | null

  // Car / other
  originAddress: string | null
  otherDetails: string | null

  // Misc
  isUnaccompaniedMinor: boolean | null
  passportNationality: string | null
  visaType: string | null
  visaNumber: string | null
}

/**
 * Look up Attend status for one or more emails. Returns a map keyed by
 * lowercased email. Missing emails are simply absent from the map.
 *
 * Thin wrapper around `lookupAttendByEmailsOrSlackIds`. Prefer that function
 * when you have Slack IDs too — Stasis user emails sometimes diverge from the
 * email a participant used to register on Attend (different gmail alias, etc.),
 * and the Slack ID is a more stable cross-system identifier.
 */
export async function lookupAttendByEmails(
  emails: string[]
): Promise<Map<string, AttendStatus>> {
  const { byEmail } = await lookupAttendByEmailsOrSlackIds(emails, [])
  return byEmail
}

/**
 * Look up Attend status matching by email OR Slack ID. Returns two maps so
 * callers can fall back from primary (email) to secondary (slackId) per
 * candidate. The same participant row appears in both maps when both keys
 * resolve.
 *
 * Used by the sync / import paths to reconcile candidates whose Stasis email
 * doesn't match their Attend registration email but whose Slack ID does.
 */
export async function lookupAttendByEmailsOrSlackIds(
  emails: string[],
  slackIds: string[]
): Promise<{ byEmail: Map<string, AttendStatus>; bySlackId: Map<string, AttendStatus> }> {
  const byEmail = new Map<string, AttendStatus>()
  const bySlackId = new Map<string, AttendStatus>()
  const pool = getAttendPool()
  if (!pool) return { byEmail, bySlackId }

  const lowered = Array.from(new Set(emails.map((e) => e.toLowerCase()).filter(Boolean)))
  const slacks = Array.from(new Set(slackIds.filter(Boolean)))
  if (lowered.length === 0 && slacks.length === 0) return { byEmail, bySlackId }

  const { rows } = await pool.query<{
    email: string
    slack_user_id: string | null
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
    `SELECT lower(p.email) AS email, p.slack_user_id,
            p.id AS participant_id, pe.id AS participant_event_id,
            pe.status, pe.created_at, pe.onboarding_completed_at, pe.checked_in_at,
            p.city, p.state, p.country_of_residence AS country, p.pronouns, p.tshirt_size
       FROM participants p
       JOIN participant_events pe ON pe.participant_id = p.id
      WHERE pe.event_id = $1
        AND (lower(p.email) = ANY($2::text[]) OR p.slack_user_id = ANY($3::text[]))`,
    [STASIS_EVENT_ID, lowered, slacks]
  )

  if (rows.length === 0) return { byEmail, bySlackId }

  // Travel data for these participant_events (inbound/outbound). Mode-agnostic
  // fields come from `travels`, flight-specific fields from `travel_legs[0]`.
  const peIds = rows.map((r) => r.participant_event_id)
  const travels = await pool.query<{
    participant_event_id: string
    direction: string
    visa_required: boolean | null
    visa_status: string | null
    travel_id: string
    mode: string | null
    carrier: string | null
    notes: string | null
    t_departure_time: string | null
    t_arrival_time: string | null
    expected_arrival_time: string | null
    flight_number: string | null
    train_departure_station: string | null
    train_arrival_station: string | null
    departure_station: string | null
    arrival_station: string | null
    departure_city: string | null
    arrival_city: string | null
    bus_departure_location: string | null
    bus_arrival_location: string | null
    origin_address: string | null
    other_details: string | null
    is_unaccompanied_minor: boolean | null
    passport_nationality: string | null
    visa_type: string | null
    visa_number: string | null
    flight_code: string | null
    confirmation_code: string | null
    departure_airport: string | null
    arrival_airport: string | null
    leg_departure_time: string | null
    leg_arrival_time: string | null
  }>(
    `SELECT t.participant_event_id, t.direction, t.visa_required, t.visa_status, t.id AS travel_id,
            t.mode, t.carrier, t.notes,
            t.departure_time AS t_departure_time, t.arrival_time AS t_arrival_time,
            t.expected_arrival_time,
            t.flight_number,
            t.train_departure_station, t.train_arrival_station,
            t.departure_station, t.arrival_station,
            t.departure_city, t.arrival_city,
            t.bus_departure_location, t.bus_arrival_location,
            t.origin_address, t.other_details,
            t.is_unaccompanied_minor, t.passport_nationality,
            t.visa_type, t.visa_number,
            tl.flight_code, tl.confirmation_code, tl.departure_airport, tl.arrival_airport,
            tl.departure_time AS leg_departure_time, tl.arrival_time AS leg_arrival_time
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
      notes: t.notes,
      // Prefer leg-level times (flights) over travel-level times (other modes).
      departureTime: t.leg_departure_time ?? t.t_departure_time,
      arrivalTime: t.leg_arrival_time ?? t.t_arrival_time,
      expectedArrivalTime: t.expected_arrival_time,
      flightNumber: t.flight_number,
      flightCode: t.flight_code,
      confirmationCode: t.confirmation_code,
      departureAirport: t.departure_airport,
      arrivalAirport: t.arrival_airport,
      trainDepartureStation: t.train_departure_station,
      trainArrivalStation: t.train_arrival_station,
      departureStation: t.departure_station,
      arrivalStation: t.arrival_station,
      departureCity: t.departure_city,
      arrivalCity: t.arrival_city,
      busDepartureLocation: t.bus_departure_location,
      busArrivalLocation: t.bus_arrival_location,
      originAddress: t.origin_address,
      otherDetails: t.other_details,
      isUnaccompaniedMinor: t.is_unaccompanied_minor,
      passportNationality: t.passport_nationality,
      visaType: t.visa_type,
      visaNumber: t.visa_number,
    }
    if (t.direction === 'inbound') existing.inbound = leg
    else if (t.direction === 'outbound') existing.outbound = leg
    travelByPe.set(t.participant_event_id, existing)
  }

  for (const r of rows) {
    const travel = travelByPe.get(r.participant_event_id)
    const hasFlight =
      !!(travel?.inbound?.confirmationCode || travel?.inbound?.flightCode)
    const status: AttendStatus = {
      found: true,
      participantId: r.participant_id,
      participantEventId: r.participant_event_id,
      email: r.email,
      slackUserId: r.slack_user_id,
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
    }
    byEmail.set(r.email, status)
    if (r.slack_user_id) bySlackId.set(r.slack_user_id, status)
  }
  return { byEmail, bySlackId }
}

export async function lookupAttendByEmail(email: string): Promise<AttendStatus | null> {
  return lookupAttendForCandidate(email, null)
}

/**
 * Look up Attend status for a single candidate, trying email first and falling
 * back to Slack ID. Use this in single-candidate routes (live status, manual
 * sync) so we surface Attend data even when Stasis-vs-Attend emails differ.
 */
export async function lookupAttendForCandidate(
  email: string | null,
  slackId: string | null
): Promise<AttendStatus | null> {
  const emails = email ? [email] : []
  const slackIds = slackId ? [slackId] : []
  if (emails.length === 0 && slackIds.length === 0) return null
  const { byEmail, bySlackId } = await lookupAttendByEmailsOrSlackIds(emails, slackIds)
  if (email) {
    const hit = byEmail.get(email.toLowerCase())
    if (hit) return hit
  }
  if (slackId) {
    const hit = bySlackId.get(slackId)
    if (hit) return hit
  }
  return null
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
