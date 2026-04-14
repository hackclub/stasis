import { NextResponse } from "next/server"
import Airtable from "airtable"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

export async function POST() {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const apiKey = process.env.AIRTABLE_API_KEY
  const baseId = process.env.AIRTABLE_BASE_ID
  if (!apiKey || !baseId) {
    return NextResponse.json(
      { error: "Airtable credentials not configured" },
      { status: 500 }
    )
  }

  const base = new Airtable({ apiKey }).base(baseId)
  const tableName = process.env.AIRTABLE_TABLE_NAME || "RSVPs"

  // Fetch all RSVP records from Airtable with UTM Source
  const airtableRecords: { email: string; utmSource: string | null; signupPage: string | null }[] = []

  await new Promise<void>((resolve, reject) => {
    base(tableName)
      .select({
        fields: ["Email", "UTM Source", "Loops - stasisSignUpPage"],
      })
      .eachPage(
        (records, fetchNextPage) => {
          for (const record of records) {
            const email = record.get("Email") as string | undefined
            const utmSource = (record.get("UTM Source") as string) || null
            const signupPage = (record.get("Loops - stasisSignUpPage") as string) || null
            if (email && (utmSource || signupPage)) {
              airtableRecords.push({
                email: email.trim().toLowerCase(),
                utmSource,
                signupPage,
              })
            }
          }
          fetchNextPage()
        },
        (err) => {
          if (err) reject(err)
          else resolve()
        }
      )
  })

  // Match with existing users and update
  let updated = 0
  let notFound = 0

  for (const record of airtableRecords) {
    try {
      const result = await prisma.user.updateMany({
        where: {
          email: record.email,
          // Only update if not already set
          OR: [
            { utmSource: null },
            { signupPage: null },
          ],
        },
        data: {
          ...(record.utmSource && { utmSource: record.utmSource }),
          ...(record.signupPage && { signupPage: record.signupPage }),
        },
      })
      if (result.count > 0) updated++
      else notFound++
    } catch {
      notFound++
    }
  }

  return NextResponse.json({
    success: true,
    airtableRecords: airtableRecords.length,
    usersUpdated: updated,
    notMatched: notFound,
  })
}
