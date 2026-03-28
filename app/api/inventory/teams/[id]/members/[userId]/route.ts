import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { removeFromTeam } from "@/lib/inventory/teams"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id, userId } = await params

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

  const isMember = team.members.some((m) => m.id === userId)
  if (!isMember) {
    return NextResponse.json({ error: "User is not a member of this team" }, { status: 400 })
  }

  await removeFromTeam(userId, id)

  return NextResponse.json({ success: true })
}
