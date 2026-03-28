import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { removeFromTeam } from "@/lib/inventory/teams"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teamId: true },
  })

  if (user?.teamId !== id) {
    return NextResponse.json({ error: "You are not a member of this team" }, { status: 400 })
  }

  await removeFromTeam(session.user.id, id)

  return NextResponse.json({ success: true })
}
