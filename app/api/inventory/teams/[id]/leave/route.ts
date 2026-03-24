import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

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

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: session.user.id },
      data: { teamId: null },
    })

    const remaining = await tx.user.count({ where: { teamId: id } })

    if (remaining === 0) {
      await tx.team.delete({ where: { id } })
    }
  })

  return NextResponse.json({ success: true })
}
