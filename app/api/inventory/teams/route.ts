import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { syncTeamChannel } from "@/lib/inventory/team-channel"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

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
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { name } = body

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Team name is required" }, { status: 400 })
  }

  const trimmedName = name.trim()

  const existing = await prisma.team.findUnique({ where: { name: trimmedName } })
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
      data: { name: trimmedName },
    })

    await tx.user.update({
      where: { id: session.user.id },
      data: { teamId: created.id },
    })

    return created
  })

  syncTeamChannel(team.id).catch(() => {})

  return NextResponse.json(team, { status: 201 })
}
