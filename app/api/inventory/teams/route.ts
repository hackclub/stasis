import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireInventoryAccess } from "@/lib/inventory/access"
import { syncTeamChannel } from "@/lib/inventory/team-channel"
import { logAudit, AuditAction } from "@/lib/audit"
import { sanitizeName } from "@/lib/inventory/validation"
import { DEFAULT_ALLOWANCE_MINUTES } from "@/lib/inventory/manufacturing"
import { MAX_TEAM_SIZE } from "@/lib/inventory/config"

export async function GET() {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error

  const [settings, teams] = await Promise.all([
    prisma.inventorySettings.findUnique({
      where: { id: "singleton" },
      select: { maxTeamSize: true },
    }),
    prisma.team.findMany({
      select: {
        id: true,
        name: true,
        locked: true,
        createdAt: true,
        maxMembersOverride: true,
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ])

  const defaultMaxTeamSize = settings?.maxTeamSize ?? MAX_TEAM_SIZE

  return NextResponse.json(
    teams
      .filter((team) => team._count.members > 0)
      .map((team) => ({
        ...team,
        maxMembers: team.maxMembersOverride ?? defaultMaxTeamSize,
      }))
  )
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

  let team
  try {
    team = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: session.user.id },
        select: { teamId: true },
      })
      if (user?.teamId) throw new Error("ALREADY_ON_TEAM")

      const settings = await tx.manufacturingSettings.findUnique({
        where: { id: "singleton" },
        select: { defaultAllowanceMinutes: true },
      })

      const created = await tx.team.create({
        data: {
          name: safeName,
          manufacturingAllowanceMinutes:
            settings?.defaultAllowanceMinutes ?? DEFAULT_ALLOWANCE_MINUTES,
        },
      })

      await tx.user.update({
        where: { id: session.user.id },
        data: { teamId: created.id },
      })

      return created
    })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "ALREADY_ON_TEAM") {
      return NextResponse.json({ error: "You are already on a team" }, { status: 400 })
    }
    // Prisma unique constraint violation (team name taken)
    if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "A team with this name already exists" }, { status: 409 })
    }
    throw err
  }

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
