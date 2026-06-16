/**
 * Reconciling sync for "Loops - stasisHasShipped" on prod Airtable RSVPs:
 * 1 if the user has an approved project (design or build) in prod Stasis,
 * otherwise the field is cleared (unset — never 0). Idempotent.
 *
 * Run with:
 *   yarn tsx scripts/sync-loops-has-shipped.ts --dry-run
 *   yarn tsx scripts/sync-loops-has-shipped.ts
 *
 * Env required:
 *   READONLY_PRODUCTION_DATABASE_URL   (prod read replica)
 *   AIRTABLE_API_KEY
 *   STASIS_PROD_AIRTABLE_BASE_ID       (prod base, appRMw1ya4lnaYsGv)
 */
import 'dotenv/config'
import Airtable from 'airtable'
import { Pool } from 'pg'

const FIELD = 'Loops - stasisHasShipped'
const DRY_RUN = process.argv.includes('--dry-run')

const apiKey = process.env.AIRTABLE_API_KEY
const baseId = process.env.STASIS_PROD_AIRTABLE_BASE_ID
const dbUrl = process.env.READONLY_PRODUCTION_DATABASE_URL
if (!apiKey || !baseId || !dbUrl) {
  console.error('Missing AIRTABLE_API_KEY, STASIS_PROD_AIRTABLE_BASE_ID, or READONLY_PRODUCTION_DATABASE_URL')
  process.exit(1)
}

async function resolveRsvpTableId(): Promise<string> {
  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`Failed to list tables: ${res.status} ${await res.text()}`)
  const { tables } = (await res.json()) as { tables: { id: string; name: string }[] }
  const table = tables.find((t) => /rsvp/i.test(t.name))
  if (!table) throw new Error(`No RSVP table found in base; tables: ${tables.map((t) => t.name).join(', ')}`)
  console.log(`Using table "${table.name}" (${table.id})`)
  return table.id
}

async function getShippedEmails(): Promise<Set<string>> {
  const pool = new Pool({ connectionString: dbUrl, max: 2, connectionTimeoutMillis: 10_000 })
  try {
    const { rows } = await pool.query<{ email: string }>(`
      SELECT DISTINCT LOWER(u.email) AS email
      FROM "user" u
      JOIN project p ON p."userId" = u.id
      WHERE p."deletedAt" IS NULL
        AND (p."buildStatus" = 'approved' OR p."designStatus" = 'approved')
        AND u.email IS NOT NULL
    `)
    return new Set(rows.map((r) => r.email))
  } finally {
    await pool.end()
  }
}

async function main() {
  const [shippedEmails, tableId] = await Promise.all([getShippedEmails(), resolveRsvpTableId()])
  console.log(`${shippedEmails.size} users with an approved project in prod DB`)

  const table = new Airtable({ apiKey }).base(baseId!)(tableId)
  const toUpdate: { id: string; email: string; value: 1 | null }[] = []
  let scanned = 0
  await table.select({ fields: ['Email', FIELD] }).eachPage((records, next) => {
    scanned += records.length
    for (const r of records) {
      const email = (r.get('Email') as string | undefined)?.trim().toLowerCase()
      const current = r.get(FIELD) as number | undefined
      const desired = email && shippedEmails.has(email) ? 1 : null
      if ((current ?? null) !== desired) toUpdate.push({ id: r.id, email: email ?? '<no email>', value: desired as 1 | null })
    }
    next()
  })
  const setting = toUpdate.filter((u) => u.value === 1).length
  console.log(`Scanned ${scanned} RSVP records; setting ${FIELD}=1 on ${setting}, clearing it on ${toUpdate.length - setting}`)

  if (DRY_RUN) {
    for (const u of toUpdate) console.log(`[dry-run] would set ${FIELD}=${u.value} for ${u.email} (${u.id})`)
    return
  }

  for (let i = 0; i < toUpdate.length; i += 10) {
    const batch = toUpdate.slice(i, i + 10)
    await table.update(batch.map((u) => ({ id: u.id, fields: { [FIELD]: u.value } })))
    console.log(`Updated ${Math.min(i + 10, toUpdate.length)}/${toUpdate.length}`)
    await new Promise((r) => setTimeout(r, 250)) // stay under 5 req/s
  }
  console.log('Done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
