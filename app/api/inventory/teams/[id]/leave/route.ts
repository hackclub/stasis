import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { removeFromTeam } from "@/lib/inventory/teams"
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

  const [user, team] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { teamId: true },
    }),
    prisma.team.findUnique({
      where: { id },
      select: { locked: true },
    }),
  ])

  if (user?.teamId !== id) {
    return NextResponse.json({ error: "You are not a member of this team" }, { status: 400 })
  }

  if (team?.locked) {
    return NextResponse.json({ error: "Team is locked and cannot be modified" }, { status: 400 })
  }

  await removeFromTeam(session.user.id, id)

  logAudit({
    action: AuditAction.INVENTORY_TEAM_LEAVE,
    actorId: session.user.id,
    actorEmail: session.user.email,
    targetType: "Team",
    targetId: id,
  }).catch(() => {})

  return NextResponse.json({ success: true })
}
