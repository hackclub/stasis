import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const excludeProjectId = searchParams.get("excludeProjectId")

  const badges = await prisma.projectBadge.findMany({
    where: {
      project: { userId: session.user.id },
      ...(excludeProjectId ? { projectId: { not: excludeProjectId } } : {}),
    },
    select: { badge: true },
  })

  const claimedTypes = [...new Set(badges.map(b => b.badge))]
  return NextResponse.json(claimedTypes)
}
