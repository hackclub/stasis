import { NextRequest, NextResponse } from "next/server"
import Airtable, { FieldSet } from "airtable"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

const NPS_BASE_ID = "appRMw1ya4lnaYsGv"
const NPS_TABLE = "NPS #1"

const ATTENDANCE_OPTIONS = [
  "Yes! (If I can)",
  "Maybe, I'm still thinking about it",
  "I'm not coming",
  "I'm trying to go to Open Sauce instead",
  "I'm just working towards prizes",
] as const

type AttendanceOption = (typeof ATTENDANCE_OPTIONS)[number]

function getNpsBase() {
  const apiKey = process.env.AIRTABLE_API_KEY
  if (!apiKey) throw new Error("AIRTABLE_API_KEY not configured")
  return new Airtable({ apiKey }).base(NPS_BASE_ID)
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { pronouns: true, email: true },
  })

  if (!user || user.pronouns !== "she/her") {
    return NextResponse.json({ eligible: false })
  }

  // Check journal entry count (work sessions with non-empty content)
  const journalCount = await prisma.workSession.count({
    where: {
      project: { userId: session.user.id, deletedAt: null },
      content: { not: "" },
      NOT: { content: null },
    },
  })

  if (journalCount < 2) {
    return NextResponse.json({ eligible: false })
  }

  // Check if already submitted NPS
  try {
    const base = getNpsBase()
    const escaped = user.email.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
    const existing = await base(NPS_TABLE)
      .select({
        filterByFormula: `{Email} = '${escaped}'`,
        maxRecords: 1,
        fields: ["Email"],
      })
      .firstPage()

    if (existing.length > 0) {
      return NextResponse.json({ eligible: false })
    }
  } catch (err) {
    console.error("Failed to check NPS Airtable:", err)
    // If Airtable is down, don't block the user
    return NextResponse.json({ eligible: false })
  }

  return NextResponse.json({ eligible: true })
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true },
  })

  if (!user?.email) {
    return NextResponse.json({ error: "No email" }, { status: 400 })
  }

  const body = await request.json()
  const { attendance, helpText, reasonText } = body as {
    attendance: string
    helpText?: string
    reasonText?: string
  }

  if (!ATTENDANCE_OPTIONS.includes(attendance as AttendanceOption)) {
    return NextResponse.json({ error: "Invalid option" }, { status: 400 })
  }

  const fields: Partial<FieldSet> = {
    Email: user.email,
    "Are you planning on attending Stasis in-person?": [attendance],
    "from platform, not fillout": true,
  }

  if (attendance === "Maybe, I'm still thinking about it" && helpText?.trim()) {
    fields["What can we do to help you come?"] = helpText.trim()
  }

  if (attendance === "I'm not coming" && reasonText?.trim()) {
    fields["Reason for not coming"] = reasonText.trim()
  }

  try {
    const base = getNpsBase()
    await base(NPS_TABLE).create([{ fields }])
  } catch (err) {
    console.error("Failed to create NPS record:", err)
    return NextResponse.json(
      { error: "Failed to save response" },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
