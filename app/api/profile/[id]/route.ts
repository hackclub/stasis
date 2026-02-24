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
      slackDisplayName: true,
      image: true,
      bio: true,
      createdAt: true,
    },
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

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

  const bitsResult = await prisma.currencyTransaction.aggregate({
    where: { userId: id },
    _sum: { amount: true },
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

  const { slackDisplayName, ...userRest } = user;
  const displayUser = { ...userRest, name: slackDisplayName || user.name };

  return NextResponse.json({
    user: displayUser,
    bitsBalance: bitsResult._sum.amount ?? 0,
    badges,
    projects,
  })
}
