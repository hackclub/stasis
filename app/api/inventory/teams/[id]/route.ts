import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { logAudit, AuditAction } from "@/lib/audit"
import { sanitizeName } from "@/lib/inventory/validation"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

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
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { name } = body

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Team name is required" }, { status: 400 })
  }

  const safeName = sanitizeName(name)
  if (safeName.length === 0) {
    return NextResponse.json({ error: "Team name is required" }, { status: 400 })
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

  const existing = await prisma.team.findUnique({ where: { name: safeName } })
  if (existing && existing.id !== id) {
    return NextResponse.json({ error: "A team with this name already exists" }, { status: 409 })
  }

  const updated = await prisma.team.update({
    where: { id },
    data: { name: safeName },
  })

  logAudit({
    action: AuditAction.INVENTORY_TEAM_RENAME,
    actorId: session.user.id,
    actorEmail: session.user.email,
    targetType: "Team",
    targetId: id,
    metadata: { oldName: team.name, newName: safeName },
  }).catch(() => {})

  return NextResponse.json(updated)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

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

  // Block delete if there are active orders or rentals
  const activeOrders = await prisma.order.count({
    where: { teamId: id, status: { notIn: ["COMPLETED", "CANCELLED"] } },
  })
  const activeRentals = await prisma.toolRental.count({
    where: { teamId: id, status: "CHECKED_OUT" },
  })
  if (activeOrders > 0 || activeRentals > 0) {
    return NextResponse.json(
      { error: "Cannot delete a team with active orders or rentals" },
      { status: 400 }
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: session.user.id },
      data: { teamId: null },
    })

    await tx.team.delete({ where: { id } })
  })

  logAudit({
    action: AuditAction.INVENTORY_TEAM_DELETE,
    actorId: session.user.id,
    actorEmail: session.user.email,
    targetType: "Team",
    targetId: id,
    metadata: { name: team.name },
  }).catch(() => {})

  return NextResponse.json({ success: true })
}
