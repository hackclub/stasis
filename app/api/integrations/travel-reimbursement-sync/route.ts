import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireIntegrationAuth } from "@/lib/integration-auth"
import { FLIGHT_STIPEND_SQL, syncTravelReimbursementForm } from "@/lib/travel-reimbursement-sync"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// Bearer-authenticated sync for the prod "Travel Reimbursement Form" Airtable
// table. Pulls each submitter's real Stasis flight-stipend total from the bits
// ledger and links their Need Based Stipends row. Driven by a Coolify cron.
// Pass ?dryRun=1 to preview the diff without writing.
export async function POST(request: NextRequest) {
  const authError = requireIntegrationAuth(request)
  if (authError) return authError

  if (!process.env.AIRTABLE_API_KEY) {
    return NextResponse.json({ error: "AIRTABLE_API_KEY not set" }, { status: 503 })
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1"

  const rows = await prisma.$queryRawUnsafe<{ email: string; usd: number }[]>(FLIGHT_STIPEND_SQL)
  const flightByEmail = new Map(rows.map((r) => [r.email, Number(r.usd)]))

  const result = await syncTravelReimbursementForm(flightByEmail, { dryRun })

  return NextResponse.json({
    dryRun,
    scanned: result.scanned,
    updated: result.updated,
    flightStipendAttendees: result.flightStipendAttendees,
    needBasedRecords: result.needBasedRecords,
    changes: result.changes,
    syncedAt: new Date().toISOString(),
  })
}
