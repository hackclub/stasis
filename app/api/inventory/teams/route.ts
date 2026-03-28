import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireInventoryAccess } from "@/lib/inventory/access"
import { syncTeamChannel } from "@/lib/inventory/team-channel"
import { logAudit, AuditAction } from "@/lib/audit"
import { sanitizeName } from "@/lib/inventory/validation"

export async function GET() {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error

  const teams = await prisma.team.findMany({
    select: {
      id: true,
      name: true,
      locked: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(teams)
}

export async function POST(request: Request) {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error
  const { session } = result

  const body = await request.json()
  const { name } = body

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Team name is required" }, { status: 400 })
  }

  const safeName = sanitizeName(name)
  if (safeName.length === 0) {
    return NextResponse.json({ error: "Team name is required" }, { status: 400 })
  }

  const existing = await prisma.team.findUnique({ where: { name: safeName } })
  if (existing) {
    return NextResponse.json({ error: "A team with this name already exists" }, { status: 409 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teamId: true },
  })

  if (user?.teamId) {
    return NextResponse.json({ error: "You are already on a team" }, { status: 400 })
  }

  const team = await prisma.$transaction(async (tx) => {
    const created = await tx.team.create({
      data: { name: safeName },
    })

    await tx.user.update({
      where: { id: session.user.id },
      data: { teamId: created.id },
    })

    return created
  })

  logAudit({
    action: AuditAction.INVENTORY_TEAM_CREATE,
    actorId: session.user.id,
    actorEmail: session.user.email,
    targetType: "Team",
    targetId: team.id,
    metadata: { name: safeName },
  }).catch(() => {})

  syncTeamChannel(team.id).catch(() => {})

  return NextResponse.json(team, { status: 201 })
}
