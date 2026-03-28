import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { MAX_TEAM_SIZE } from "@/lib/inventory/config"
import { syncTeamChannel } from "@/lib/inventory/team-channel"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { slackId } = body

  if (!slackId || typeof slackId !== "string") {
    return NextResponse.json({ error: "slackId is required" }, { status: 400 })
  }

  const team = await prisma.team.findUnique({
    where: { id },
    include: { _count: { select: { members: true } } },
  })

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 })
  }

  if (team.locked) {
    return NextResponse.json({ error: "Team is locked" }, { status: 403 })
  }

  if (team._count.members >= MAX_TEAM_SIZE) {
    return NextResponse.json({ error: "Team is full" }, { status: 400 })
  }

  const targetUser = await prisma.user.findUnique({
    where: { slackId },
    select: { id: true, teamId: true },
  })

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  if (targetUser.teamId) {
    return NextResponse.json({ error: "User is already on a team" }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: targetUser.id },
    data: { teamId: id },
  })

  syncTeamChannel(id).catch(() => {})

  return NextResponse.json({ success: true })
}
