import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"

export async function GET() {
  const adminCheck = await requireAdmin()
  if (adminCheck.error) return adminCheck.error

  const users = await prisma.user.findMany({
    include: {
      projects: {
        include: {
          workSessions: true,
          badges: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const usersWithStats = users.map((user) => ({
    ...user,
    totalProjects: user.projects.length,
    totalHoursClaimed: user.projects.reduce(
      (acc, p) => acc + p.workSessions.reduce((a, s) => a + s.hoursClaimed, 0),
      0
    ),
    totalHoursApproved: user.projects.reduce(
      (acc, p) => acc + p.workSessions.reduce((a, s) => a + (s.hoursApproved ?? 0), 0),
      0
    ),
    badges: user.projects.flatMap((p) => p.badges),
  }))

  return NextResponse.json(usersWithStats)
}
