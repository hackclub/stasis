import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { MAX_TEAM_SIZE } from "@/lib/inventory/config"
import { syncTeamChannel } from "@/lib/inventory/team-channel"
import { logAudit, AuditAction } from "@/lib/audit"

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

  // Verify caller is a member of this team or an admin
  const caller = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teamId: true },
  })
  const callerIsAdmin = await prisma.userRole.findFirst({
    where: { userId: session.user.id, role: "ADMIN" },
  })

  if (caller?.teamId !== id && !callerIsAdmin) {
    return NextResponse.json({ error: "You must be a member of this team to add members" }, { status: 403 })
  }

  let targetUserId: string
  try {
    targetUserId = await prisma.$transaction(async (tx) => {
      const team = await tx.team.findUnique({
        where: { id },
        include: { _count: { select: { members: true } } },
      })
      if (!team) throw new Error("TEAM_NOT_FOUND")
      if (team.locked) throw new Error("TEAM_LOCKED")
      if (team._count.members >= MAX_TEAM_SIZE) throw new Error("TEAM_FULL")

      const target = await tx.user.findUnique({
        where: { slackId },
        select: { id: true, teamId: true },
      })
      if (!target) throw new Error("USER_NOT_FOUND")
      if (target.teamId) throw new Error("ALREADY_ON_TEAM")

      await tx.user.update({
        where: { id: target.id },
        data: { teamId: id },
      })
      return target.id
    })
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "TEAM_NOT_FOUND") return NextResponse.json({ error: "Team not found" }, { status: 404 })
      if (err.message === "TEAM_LOCKED") return NextResponse.json({ error: "Team is locked" }, { status: 403 })
      if (err.message === "TEAM_FULL") return NextResponse.json({ error: "Team is full" }, { status: 400 })
      if (err.message === "USER_NOT_FOUND") return NextResponse.json({ error: "User not found" }, { status: 404 })
      if (err.message === "ALREADY_ON_TEAM") return NextResponse.json({ error: "User is already on a team" }, { status: 400 })
    }
    throw err
  }

  logAudit({
    action: AuditAction.INVENTORY_TEAM_ADD_MEMBER,
    actorId: session.user.id,
    actorEmail: session.user.email,
    targetType: "Team",
    targetId: id,
    metadata: { addedUserId: targetUserId },
  }).catch(() => {})

  syncTeamChannel(id).catch(() => {})

  return NextResponse.json({ success: true })
}
