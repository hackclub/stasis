import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { airtableFindByEmail, airtableCreateRSVP, airtableEnsureRSVPExists } from "@/lib/airtable"

// Airtable enforces ~5 req/s; stay well under with a 250ms delay between entries.
const AIRTABLE_DELAY_MS = 250

export async function POST() {
  const authCheck = await requireAdmin()
  if (authCheck.error) return authCheck.error

  const rsvps = await prisma.tempRsvp.findMany({
    where: { syncedToAirtable: false },
  })

  let synced = 0
  let skipped = 0
  const errors: string[] = []

  for (const rsvp of rsvps) {
    if (synced + skipped > 0) {
      await new Promise((r) => setTimeout(r, AIRTABLE_DELAY_MS))
    }

    try {
      const exists = await airtableFindByEmail(rsvp.email)
      const name = [rsvp.firstName, rsvp.lastName].filter(Boolean).join(" ").slice(0, 100)

      if (exists) {
        if (name && rsvp.finishedAccount) await airtableEnsureRSVPExists(rsvp.email, name)
      } else {
        await airtableCreateRSVP({
          email: rsvp.email,
          ip: rsvp.ip || undefined,
          referralType: rsvp.utmSource,
          referredBy: rsvp.referredBy,
        })
        if (name && rsvp.finishedAccount) await airtableEnsureRSVPExists(rsvp.email, name)
      }

      await prisma.tempRsvp.update({
        where: { id: rsvp.id },
        data: { syncedToAirtable: true },
      })
      synced++
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      errors.push(`${rsvp.email}: ${msg}`)
      skipped++
    }
  }

  return NextResponse.json({ synced, skipped, errors })
}
