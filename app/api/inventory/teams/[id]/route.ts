import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { logAudit, AuditAction } from "@/lib/audit"
import { sanitizeName } from "@/lib/inventory/validation"
import { requireInventoryAccess } from "@/lib/inventory/access"
import { ACTIVE_TEAM_REQUESTS_ERROR, removeFromTeam } from "@/lib/inventory/teams"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error
  const { session } = result

  const { id } = await params

  // Only allow members of the team or admins to view team details
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teamId: true },
  })
  const isAdmin = await prisma.userRole.findFirst({
    where: { userId: session.user.id, role: "ADMIN" },
  })

  if (user?.teamId !== id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const team = await prisma.team.findUnique({
    where: { id },
    include: {
      members: {
        select: {
          id: true,
          name: true,
          slackDisplayName: true,
          image: true,
        },
      },
    },
  })

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 })
  }

  return NextResponse.json(team)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error
  const { session } = result

  const { id } = await params
  const body = await request.json()
  const hasName = body?.name !== undefined
  const hasAutoApprove = body?.manufacturingAutoApprovePrints !== undefined

  if (!hasName && !hasAutoApprove) {
    return NextResponse.json({ error: "No team update provided" }, { status: 400 })
  }

  let safeName: string | null = null
  if (hasName) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json({ error: "Team name is required" }, { status: 400 })
    }
    safeName = sanitizeName(body.name)
    if (safeName.length === 0) {
      return NextResponse.json({ error: "Team name is required" }, { status: 400 })
    }
  }

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

  const isMember = team.members.some((m) => m.id === session.user.id)
  if (!isMember) {
    return NextResponse.json({ error: "You are not a member of this team" }, { status: 403 })
  }

  if (safeName) {
    const existing = await prisma.team.findUnique({ where: { name: safeName } })
    if (existing && existing.id !== id) {
      return NextResponse.json({ error: "A team with this name already exists" }, { status: 409 })
    }
  }

  let updated
  try {
    updated = await prisma.team.update({
      where: { id },
      data: {
        ...(safeName ? { name: safeName } : {}),
        ...(hasAutoApprove ? { manufacturingAutoApprovePrints: Boolean(body.manufacturingAutoApprovePrints) } : {}),
      },
    })
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "A team with this name already exists" }, { status: 409 })
    }
    throw err
  }

  if (safeName) {
    logAudit({
      action: AuditAction.INVENTORY_TEAM_RENAME,
      actorId: session.user.id,
      actorEmail: session.user.email,
      targetType: "Team",
      targetId: id,
      metadata: { oldName: team.name, newName: safeName },
    }).catch(() => {})
  }
  if (hasAutoApprove) {
    logAudit({
      action: AuditAction.INVENTORY_SETTINGS_UPDATE,
      actorId: session.user.id,
      actorEmail: session.user.email,
      targetType: "Team",
      targetId: id,
      metadata: { manufacturingAutoApprovePrints: Boolean(body.manufacturingAutoApprovePrints) },
    }).catch(() => {})
  }

  return NextResponse.json(updated)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error
  const { session } = result

  const { id } = await params

  const team = await prisma.team.findUnique({
    where: { id },
    include: { members: { select: { id: true } } },
  })

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 })
  }

  const isMember = team.members.some((m) => m.id === session.user.id)
  if (!isMember) {
    return NextResponse.json({ error: "You are not a member of this team" }, { status: 403 })
  }

  if (team.locked) {
    return NextResponse.json({ error: "Team is locked" }, { status: 403 })
  }

  if (team.members.length > 1) {
    return NextResponse.json(
      { error: "Cannot delete a team with other members. All other members must leave first." },
      { status: 400 }
    )
  }

  // Block delete/leave if there are active requests tied to this team.
  const [activeOrders, activeRentals, activeManufacturingJobs] = await Promise.all([
    prisma.order.count({
      where: { teamId: id, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    }),
    prisma.toolRental.count({
      where: {
        teamId: id,
        status: { in: ["PLACED", "IN_PROGRESS", "READY", "CHECKED_OUT", "RETURN_REQUESTED"] },
      },
    }),
    prisma.manufacturingJob.count({
      where: {
        teamId: id,
        status: { in: ["PENDING", "TIME_APPROVAL_REQUESTED", "QUEUED", "PRINTING", "READY"] },
      },
    }),
  ])
  if (activeOrders > 0 || activeRentals > 0 || activeManufacturingJobs > 0) {
    return NextResponse.json(
      { error: ACTIVE_TEAM_REQUESTS_ERROR },
      { status: 400 }
    )
  }

  let removal
  try {
    removal = await removeFromTeam(session.user.id, id)
  } catch (error) {
    if (error instanceof Error && error.message === ACTIVE_TEAM_REQUESTS_ERROR) {
      return NextResponse.json({ error: ACTIVE_TEAM_REQUESTS_ERROR }, { status: 400 })
    }
    throw error
  }

  logAudit({
    action: removal.deleted ? AuditAction.INVENTORY_TEAM_DELETE : AuditAction.INVENTORY_TEAM_LEAVE,
    actorId: session.user.id,
    actorEmail: session.user.email,
    targetType: "Team",
    targetId: id,
    metadata: { name: team.name, deleted: removal.deleted },
  }).catch(() => {})

  return NextResponse.json({ success: true, deleted: removal.deleted })
}
