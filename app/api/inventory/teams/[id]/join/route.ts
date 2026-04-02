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

  let team
  try {
    team = await prisma.$transaction(async (tx) => {
      const txTeam = await tx.team.findUnique({
        where: { id },
        include: { _count: { select: { members: true } } },
      })
      if (!txTeam) throw new Error("TEAM_NOT_FOUND")
      if (txTeam.locked) throw new Error("TEAM_LOCKED")
      if (txTeam._count.members >= MAX_TEAM_SIZE) throw new Error("TEAM_FULL")

      const user = await tx.user.findUnique({
        where: { id: session.user.id },
        select: { teamId: true },
      })
      if (user?.teamId) throw new Error("ALREADY_ON_TEAM")

      await tx.user.update({
        where: { id: session.user.id },
        data: { teamId: id },
      })
      return txTeam
    })
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "TEAM_NOT_FOUND") return NextResponse.json({ error: "Team not found" }, { status: 404 })
      if (err.message === "TEAM_LOCKED") return NextResponse.json({ error: "Team is locked" }, { status: 403 })
      if (err.message === "TEAM_FULL") return NextResponse.json({ error: "Team is full" }, { status: 400 })
      if (err.message === "ALREADY_ON_TEAM") return NextResponse.json({ error: "You are already on a team" }, { status: 400 })
    }
    throw err
  }

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
