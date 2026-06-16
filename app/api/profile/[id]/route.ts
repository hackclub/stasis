import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Profiles are public — viewable without an account.
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
  // Use raw SQL with text cast to avoid enum validation error if migration hasn't run
  const pendingRows = await prisma.$queryRaw<{ pending: bigint | null }[]>`
    SELECT COALESCE(SUM(amount), 0) as pending
    FROM currency_transaction
    WHERE "userId" = ${id} AND type::text = 'DESIGN_APPROVED'
  `
  const pendingBitsAmount = Number(pendingRows[0]?.pending ?? 0)

  // Aggregate work sessions by date for activity heatmap, with a
  // per-project breakdown so the UI can show what was worked on each day.
  const workSessions = await prisma.workSession.findMany({
    where: {
      project: { userId: id, deletedAt: null },
    },
    select: {
      createdAt: true,
      hoursClaimed: true,
      projectId: true,
      project: { select: { title: true } },
    },
  })

  type ProjectBreakdown = { projectId: string; title: string; hours: number; sessions: number }
  type DayAgg = { hours: number; sessions: number; projects: Map<string, ProjectBreakdown> }
  const activityMap = new Map<string, DayAgg>()
  for (const ws of workSessions) {
    const dateStr = ws.createdAt.toISOString().slice(0, 10)
    const existing = activityMap.get(dateStr) || { hours: 0, sessions: 0, projects: new Map() }
    existing.hours += ws.hoursClaimed
    existing.sessions += 1
    const proj = existing.projects.get(ws.projectId) || {
      projectId: ws.projectId,
      title: ws.project.title,
      hours: 0,
      sessions: 0,
    }
    proj.hours += ws.hoursClaimed
    proj.sessions += 1
    existing.projects.set(ws.projectId, proj)
    activityMap.set(dateStr, existing)
  }
  const activity = Array.from(activityMap.entries()).map(([date, data]) => ({
    date,
    hours: Math.round(data.hours * 100) / 100,
    sessions: data.sessions,
    projects: Array.from(data.projects.values())
      .map((p) => ({ ...p, hours: Math.round(p.hours * 100) / 100 }))
      .sort((a, b) => b.hours - a.hours),
  }))

  const projects = await prisma.project.findMany({
    where: {
      userId: id,
      deletedAt: null,
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
    pendingBits: pendingBitsAmount,
    badges,
    projects,
    activity,
  })
}
