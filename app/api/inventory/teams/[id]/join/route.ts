import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { MAX_TEAM_SIZE } from "@/lib/inventory/config"

export async function POST(
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

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: session.user.id },
      data: { teamId: id },
    })
  })

  return NextResponse.json({ success: true })
}
