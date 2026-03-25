import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { assignSidekick } from "@/lib/sidekick"
import { inviteToSecretSpot } from "@/lib/slack"

const VALID_PRONOUNS = ["he/him", "she/her", "they/them"]

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { pronouns: true },
  })

  return NextResponse.json({ pronouns: user?.pronouns ?? null })
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { pronouns } = body

  if (!VALID_PRONOUNS.includes(pronouns)) {
    return NextResponse.json({ error: "Invalid pronouns" }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { pronouns },
  })

  // Assign a sidekick now that we know their pronouns (match with same pronouns)
  const existingAssignment = await prisma.sidekickAssignment.findUnique({
    where: { assigneeId: session.user.id },
  })

  if (!existingAssignment) {
    try {
      await assignSidekick(session.user.id, pronouns)
    } catch (error) {
      console.error("Failed to assign sidekick after pronouns:", error)
    }
  }

  // Invite she/her users to #stasis-secret-spot
  if (pronouns === "she/her") {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { slackId: true },
    })
    if (user?.slackId) {
      inviteToSecretSpot(user.slackId).catch((err) =>
        console.error("Failed to invite to secret spot:", err)
      )
    }
  }

  return NextResponse.json({ success: true })
}
