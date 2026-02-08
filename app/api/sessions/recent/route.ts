import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import prisma from "@/lib/prisma"

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const recentSessions = await prisma.workSession.findMany({
    where: {
      project: {
        userId: session.user.id,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 5,
    select: {
      id: true,
      title: true,
      hoursClaimed: true,
      stage: true,
      createdAt: true,
      project: {
        select: {
          id: true,
          title: true,
        },
      },
      media: {
        take: 1,
        where: {
          type: "IMAGE",
        },
        select: {
          url: true,
        },
      },
    },
  })

  return NextResponse.json(recentSessions)
}
