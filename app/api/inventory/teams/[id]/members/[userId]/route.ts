import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { removeFromTeam } from "@/lib/inventory/teams"
import { logAudit, AuditAction } from "@/lib/audit"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id, userId } = await params

  const team = await prisma.team.findUnique({
    where: { id },
    include: { members: { select: { id: true } } },
  })

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 })
  }

  if (team.locked) {
    return NextResponse.json({ error: "Team is locked" }, { status: 403 })
  }

  // Any current team member can remove other members (self-removal uses /leave)
  const callerIsMember = team.members.some((m) => m.id === session.user.id)
  const isSelfRemoval = session.user.id === userId

  if (!callerIsMember) {
    return NextResponse.json({ error: "Only team members can remove users from this team" }, { status: 403 })
  }

  const targetIsMember = team.members.some((m) => m.id === userId)
  if (!targetIsMember) {
    return NextResponse.json({ error: "User is not a member of this team" }, { status: 400 })
  }

  await removeFromTeam(userId, id)

  logAudit({
    action: isSelfRemoval ? AuditAction.INVENTORY_TEAM_LEAVE : AuditAction.INVENTORY_TEAM_KICK_MEMBER,
    actorId: session.user.id,
    actorEmail: session.user.email,
    targetType: "Team",
    targetId: id,
    metadata: { removedUserId: userId },
  }).catch(() => {})

  return NextResponse.json({ success: true })
}
