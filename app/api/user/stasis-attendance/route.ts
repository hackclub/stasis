import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

const ONE_DAY_MS = 24 * 60 * 60 * 1000

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      createdAt: true,
      stasisAttendSurveyAt: true,
      stasisAttendInterested: true,
      stasisAttendPlanning: true,
    },
  })

  if (!user) {
    return NextResponse.json({ eligible: false })
  }

  const accountAgeMs = Date.now() - user.createdAt.getTime()
  const accountOldEnough = accountAgeMs >= ONE_DAY_MS
  const alreadyAnswered = user.stasisAttendSurveyAt !== null

  return NextResponse.json({
    eligible: accountOldEnough && !alreadyAnswered,
    answered: alreadyAnswered,
  })
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { interested, planning } = body as {
    interested: unknown
    planning: unknown
  }

  if (typeof interested !== "boolean" || typeof planning !== "boolean") {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      stasisAttendInterested: interested,
      stasisAttendPlanning: planning,
      stasisAttendSurveyAt: new Date(),
    },
  })

  return NextResponse.json({ success: true })
}
