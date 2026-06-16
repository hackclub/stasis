/**
 * Reconciling sync for the prod "Travel Reimbursement Form" Airtable table.
 *
 * The form (https://forms.hackclub.com/stasis-travel-reimbursement) only fills
 * the first columns: Email, Reported Need-Based Stipend, Reported Shop Stipend,
 * Projects. This script auto-fills the remaining two by pulling the *real*
 * numbers from the systems of record:
 *
 *   - "Actual Shop Stipend"        <- net Stasis flight-stipend dollars from the
 *                                     prod Postgres bits ledger (1 bit = $1).
 *   - "Need-Based Stipend Record"  <- link to the matching row in the
 *                                     "Need Based Stipends" table (joined by
 *                                     email), which surfaces the real
 *                                     "Approved amount".
 *
 * Flight-stipend purchases are recorded as one $10 (-10 bit) debit per click.
 * When paid with pending (design-approved) bits the debit lands on a
 * DESIGN_APPROVED row and the SHOP_PURCHASE row is amount=0, so we sum *all*
 * `flight-stipend`-tagged rows (negating the debits; refunds net out) rather
 * than only SHOP_PURCHASE. Restricted to Stasis attendees (attendRegisteredAt
 * set) so we capture the Stasis stipend, not an Open Sauce one.
 *
 * Idempotent: only writes cells whose value would actually change.
 *
 * Run with:
 *   yarn tsx scripts/sync-travel-reimbursement.ts --dry-run
 *   yarn tsx scripts/sync-travel-reimbursement.ts
 *
 * Env required:
 *   READONLY_PRODUCTION_DATABASE_URL   (prod read replica)
 *   AIRTABLE_API_KEY
 *   STASIS_PROD_AIRTABLE_BASE_ID       (prod base, appRMw1ya4lnaYsGv)
 */
import 'dotenv/config'
import Airtable from 'airtable'
import { Pool } from 'pg'

const TRAVEL_TABLE_ID = 'tbl4hXsIJoWTrVTsx' // Travel Reimbursement Form
const NEED_BASED_TABLE_ID = 'tblrekVLXlHMNWH53' // Need Based Stipends

const F_EMAIL = 'Email'
const F_ACTUAL_SHOP = 'Actual Shop Stipend'
const F_NB_LINK = 'Need-Based Stipend Record'

const DRY_RUN = process.argv.includes('--dry-run')

const apiKey = process.env.AIRTABLE_API_KEY
const baseId = process.env.STASIS_PROD_AIRTABLE_BASE_ID
const dbUrl = process.env.READONLY_PRODUCTION_DATABASE_URL
if (!apiKey || !baseId || !dbUrl) {
  console.error('Missing AIRTABLE_API_KEY, STASIS_PROD_AIRTABLE_BASE_ID, or READONLY_PRODUCTION_DATABASE_URL')
  process.exit(1)
}

/** email (lowercased) -> net Stasis flight-stipend dollars. */
async function getFlightStipendByEmail(): Promise<Map<string, number>> {
  const pool = new Pool({ connectionString: dbUrl, max: 2, connectionTimeoutMillis: 10_000 })
  try {
    const { rows } = await pool.query<{ email: string; usd: string }>(`
      SELECT LOWER(u.email) AS email, -SUM(ct.amount) AS usd
      FROM currency_transaction ct
      JOIN "user" u ON u.id = ct."userId"
      WHERE ct."shopItemId" = 'flight-stipend'
        AND u."attendRegisteredAt" IS NOT NULL
        AND u.email IS NOT NULL
      GROUP BY LOWER(u.email)
      HAVING -SUM(ct.amount) <> 0
    `)
    return new Map(rows.map((r) => [r.email, Number(r.usd)]))
  } finally {
    await pool.end()
  }
}

/** email (lowercased) -> Need Based Stipends record id. */
async function getNeedBasedRecordByEmail(): Promise<Map<string, string>> {
  const table = new Airtable({ apiKey }).base(baseId!)(NEED_BASED_TABLE_ID)
  const map = new Map<string, string>()
  await table.select({ fields: [F_EMAIL] }).eachPage((records, next) => {
    for (const r of records) {
      const email = (r.get(F_EMAIL) as string | undefined)?.trim().toLowerCase()
      if (email) map.set(email, r.id) // last row wins on dup email
    }
    next()
  })
  return map
}

async function main() {
  const [flightByEmail, nbByEmail] = await Promise.all([
    getFlightStipendByEmail(),
    getNeedBasedRecordByEmail(),
  ])
  console.log(
    `${flightByEmail.size} Stasis attendees with a flight stipend; ${nbByEmail.size} need-based stipend records`
  )

  const table = new Airtable({ apiKey }).base(baseId!)(TRAVEL_TABLE_ID)
  const toUpdate: { id: string; email: string; fields: Record<string, unknown> }[] = []
  let scanned = 0

  await table.select({ fields: [F_EMAIL, F_ACTUAL_SHOP, F_NB_LINK] }).eachPage((records, next) => {
    scanned += records.length
    for (const r of records) {
      const email = (r.get(F_EMAIL) as string | undefined)?.trim().toLowerCase()

      // Desired shop stipend: real flight stipend, or $0 if none found.
      const desiredShop = (email && flightByEmail.get(email)) || 0
      const currentShop = (r.get(F_ACTUAL_SHOP) as number | undefined) ?? 0

      // Desired need-based link: matched record id, or none.
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

  console.log(`Scanned ${scanned} form rows; ${toUpdate.length} need updating`)

  if (DRY_RUN) {
    for (const u of toUpdate) console.log(`[dry-run] ${u.email} (${u.id}) <- ${JSON.stringify(u.fields)}`)
    return
  }

  for (let i = 0; i < toUpdate.length; i += 10) {
    const batch = toUpdate.slice(i, i + 10)
    await table.update(batch.map((u) => ({ id: u.id, fields: u.fields })))
    console.log(`Updated ${Math.min(i + 10, toUpdate.length)}/${toUpdate.length}`)
    await new Promise((r) => setTimeout(r, 250)) // stay under 5 req/s
  }
  console.log('Done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
