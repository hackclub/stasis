import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { updateRSVPPronouns } from "@/lib/airtable"

// Airtable enforces ~5 req/s; stay well under with a 250ms delay between entries.
const AIRTABLE_DELAY_MS = 250

export async function POST() {
  const authCheck = await requireAdmin()
  if (authCheck.error) return authCheck.error

  const users = await prisma.user.findMany({
    where: { pronouns: { not: null } },
    select: { email: true, pronouns: true },
  })

  let synced = 0
  let skipped = 0
  const errors: string[] = []

  for (const user of users) {
    if (synced + skipped > 0) {
      await new Promise((r) => setTimeout(r, AIRTABLE_DELAY_MS))
    }

    try {
      const updated = await updateRSVPPronouns(user.email, user.pronouns!)
      if (updated) {
        synced++
      } else {
        skipped++
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      errors.push(`${user.email}: ${msg}`)
      skipped++
    }
  }

  return NextResponse.json({ total: users.length, synced, skipped, errors })
}
