import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      image: true,
      bio: true,
      createdAt: true,
    },
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const xpData = await prisma.userXP.findUnique({
    where: { userId: id },
    select: { totalXP: true },
  })

  const badges = await prisma.projectBadge.findMany({
    where: {
      project: { userId: id },
      grantedAt: { not: null },
    },
    select: {
      badge: true,
      grantedAt: true,
    },
  })

  const projects = await prisma.project.findMany({
    where: {
      userId: id,
      workSessions: { some: {} },
    },
    select: {
      id: true,
      title: true,
      description: true,
      coverImage: true,
      tags: true,
      designStatus: true,
      buildStatus: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({
    user,
    xp: { totalXP: xpData?.totalXP ?? 0 },
    badges,
    projects,
  })
}
