/**
 * Standalone runner for the Travel Reimbursement Form sync (see
 * lib/travel-reimbursement-sync.ts for the logic). The automated path is the
 * bearer-authed route /api/integrations/travel-reimbursement-sync driven by a
 * Coolify cron; this script is for ad-hoc/local runs against the read replica.
 *
 * Run with:
 *   yarn tsx scripts/sync-travel-reimbursement.ts --dry-run
 *   yarn tsx scripts/sync-travel-reimbursement.ts
 *
 * Env required:
 *   READONLY_PRODUCTION_DATABASE_URL   (prod read replica)
 *   AIRTABLE_API_KEY
 */
import 'dotenv/config'
import { Pool } from 'pg'
import { FLIGHT_STIPEND_SQL, syncTravelReimbursementForm } from '../lib/travel-reimbursement-sync'

const DRY_RUN = process.argv.includes('--dry-run')

const dbUrl = process.env.READONLY_PRODUCTION_DATABASE_URL
if (!process.env.AIRTABLE_API_KEY || !dbUrl) {
  console.error('Missing AIRTABLE_API_KEY or READONLY_PRODUCTION_DATABASE_URL')
  process.exit(1)
}

async function getFlightStipendByEmail(): Promise<Map<string, number>> {
  const pool = new Pool({ connectionString: dbUrl, max: 2, connectionTimeoutMillis: 10_000 })
  try {
    const { rows } = await pool.query<{ email: string; usd: string }>(FLIGHT_STIPEND_SQL)
    return new Map(rows.map((r) => [r.email, Number(r.usd)]))
  } finally {
    await pool.end()
  }
}

async function main() {
  const flightByEmail = await getFlightStipendByEmail()
  const result = await syncTravelReimbursementForm(flightByEmail, { dryRun: DRY_RUN })

  console.log(
    `${result.flightStipendAttendees} Stasis attendees with a flight stipend; ` +
      `${result.needBasedRecords} need-based stipend records`
  )
  console.log(`Scanned ${result.scanned} form rows; ${result.updated} ${DRY_RUN ? 'would change' : 'updated'}`)
  if (DRY_RUN) {
    for (const c of result.changes) console.log(`[dry-run] ${c.email} (${c.id}) <- ${JSON.stringify(c.fields)}`)
  } else {
    console.log('Done')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
