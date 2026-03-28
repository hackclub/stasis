import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireInventoryAccess } from "@/lib/inventory/access"
import { MAX_TEAM_SIZE } from "@/lib/inventory/config"
import { syncTeamChannel } from "@/lib/inventory/team-channel"
import { logAudit, AuditAction } from "@/lib/audit"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error
  const { session } = result

  const { id } = await params

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

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teamId: true },
  })

  if (user?.teamId) {
    return NextResponse.json({ error: "You are already on a team" }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { teamId: id },
  })

  logAudit({
    action: AuditAction.INVENTORY_TEAM_JOIN,
    actorId: session.user.id,
    actorEmail: session.user.email,
    targetType: "Team",
    targetId: id,
    metadata: { teamName: team.name },
  }).catch(() => {})

  syncTeamChannel(id).catch(() => {})

  return NextResponse.json({ success: true })
}
