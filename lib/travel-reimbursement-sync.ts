import Airtable from 'airtable'

// Auto-fills the prod "Travel Reimbursement Form" Airtable table's two derived
// columns from the systems of record. The form itself only captures Email,
// Reported Need-Based Stipend, Reported Shop Stipend, and Projects.
//
//   - "Actual Shop Stipend"        <- net Stasis flight-stipend dollars from the
//                                     bits ledger (1 bit = $1).
//   - "Need-Based Stipend Record"  <- link to the matching "Need Based Stipends"
//                                     row (joined by email), which surfaces the
//                                     real "Approved amount".
//
// Same prod base as lib/need-based-stipends.ts.
const BASE_ID = 'appRMw1ya4lnaYsGv'
const TRAVEL_TABLE_ID = 'tbl4hXsIJoWTrVTsx' // Travel Reimbursement Form
const NEED_BASED_TABLE_ID = 'tblrekVLXlHMNWH53' // Need Based Stipends

const F_EMAIL = 'Email'
const F_ACTUAL_SHOP = 'Actual Shop Stipend'
const F_NB_LINK = 'Need-Based Stipend Record'

// Net Stasis flight-stipend dollars per user. Flight stipend is bought $10 at a
// time (-10 bits). When paid from the pending pool the debit lands on a
// DESIGN_APPROVED row and the SHOP_PURCHASE row is amount=0, so we sum *all*
// `flight-stipend`-tagged rows (negating debits; refunds net out) rather than
// only SHOP_PURCHASE. Restricted to Stasis attendees so this is the Stasis
// stipend, not an Open Sauce one.
export const FLIGHT_STIPEND_SQL = `
  SELECT LOWER(u.email) AS email, (-SUM(ct.amount))::int AS usd
  FROM currency_transaction ct
  JOIN "user" u ON u.id = ct."userId"
  WHERE ct."shopItemId" = 'flight-stipend'
    AND u."attendRegisteredAt" IS NOT NULL
    AND u.email IS NOT NULL
  GROUP BY LOWER(u.email)
  HAVING -SUM(ct.amount) <> 0
`

export interface TravelSyncResult {
  scanned: number
  updated: number
  flightStipendAttendees: number
  needBasedRecords: number
  changes: { email: string; id: string; fields: Record<string, unknown> }[]
}

/** email (lowercased) -> Need Based Stipends record id. */
async function getNeedBasedRecordByEmail(base: Airtable.Base): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  await base(NEED_BASED_TABLE_ID)
    .select({ fields: [F_EMAIL] })
    .eachPage((records, next) => {
      for (const r of records) {
        const email = (r.get(F_EMAIL) as string | undefined)?.trim().toLowerCase()
        if (email) map.set(email, r.id) // last row wins on dup email
      }
      next()
    })
  return map
}

/**
 * Reconcile the Travel Reimbursement Form against the given flight-stipend map.
 * Idempotent: only writes cells whose value would actually change. Pass
 * `dryRun` to compute the diff without writing.
 */
export async function syncTravelReimbursementForm(
  flightByEmail: Map<string, number>,
  opts: { dryRun?: boolean } = {}
): Promise<TravelSyncResult> {
  const apiKey = process.env.AIRTABLE_API_KEY
  if (!apiKey) throw new Error('AIRTABLE_API_KEY not set')

  const base = new Airtable({ apiKey }).base(BASE_ID)
  const nbByEmail = await getNeedBasedRecordByEmail(base)

  const table = base(TRAVEL_TABLE_ID)
  const toUpdate: { id: string; email: string; fields: Record<string, unknown> }[] = []
  let scanned = 0

  await table.select({ fields: [F_EMAIL, F_ACTUAL_SHOP, F_NB_LINK] }).eachPage((records, next) => {
    scanned += records.length
    for (const r of records) {
      const email = (r.get(F_EMAIL) as string | undefined)?.trim().toLowerCase()

      const desiredShop = (email && flightByEmail.get(email)) || 0
      const currentShop = (r.get(F_ACTUAL_SHOP) as number | undefined) ?? 0

      const desiredNbId = email ? nbByEmail.get(email) ?? null : null
      const currentLinks = (r.get(F_NB_LINK) as { id: string }[] | undefined) ?? []
      const currentNbId = currentLinks[0]?.id ?? null

      const fields: Record<string, unknown> = {}
      if (currentShop !== desiredShop) fields[F_ACTUAL_SHOP] = desiredShop
      if (currentNbId !== desiredNbId) fields[F_NB_LINK] = desiredNbId ? [desiredNbId] : []

      if (Object.keys(fields).length > 0) {
        toUpdate.push({ id: r.id, email: email ?? '<no email>', fields })
      }
    }
    next()
  })

  if (!opts.dryRun) {
    for (let i = 0; i < toUpdate.length; i += 10) {
      const batch = toUpdate.slice(i, i + 10)
      await table.update(batch.map((u) => ({ id: u.id, fields: u.fields })))
      await new Promise((r) => setTimeout(r, 250)) // stay under 5 req/s
    }
  }

  return {
    scanned,
    updated: toUpdate.length,
    flightStipendAttendees: flightByEmail.size,
    needBasedRecords: nbByEmail.size,
    changes: toUpdate,
  }
}
