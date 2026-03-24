import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export async function GET(
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

  const trimmedName = name.trim()

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

  const existing = await prisma.team.findUnique({ where: { name: trimmedName } })
  if (existing && existing.id !== id) {
    return NextResponse.json({ error: "A team with this name already exists" }, { status: 409 })
  }

  const updated = await prisma.team.update({
    where: { id },
    data: { name: trimmedName },
  })

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

  if (team.members.length > 1) {
    return NextResponse.json(
      { error: "Cannot delete a team with other members. All other members must leave first." },
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

  return NextResponse.json({ success: true })
}
