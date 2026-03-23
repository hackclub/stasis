import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { updateTargetGoal } from "@/lib/airtable"

// Legacy route — kept for backward compatibility, prefer /api/user/goal-preference
const VALID_GOALS = ["stasis", "opensauce", "prizes"]

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { eventPreference: true },
  })

  return NextResponse.json({ event: user?.eventPreference ?? "stasis" })
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { event } = body

  if (!VALID_GOALS.includes(event)) {
    return NextResponse.json({ error: "Invalid goal" }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { eventPreference: event },
    select: { email: true },
  })

  // Update Airtable target goal in the background
  updateTargetGoal(user.email, event).catch((err) =>
    console.error("Failed to update Airtable target goal:", err)
  )

  return NextResponse.json({ success: true })
}
