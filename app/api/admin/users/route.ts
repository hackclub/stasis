import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

export async function GET() {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      createdAt: true,
      fraudConvicted: true,
      slackId: true,
      verificationStatus: true,
      projects: {
        select: {
          id: true,
          title: true,
          designStatus: true,
          buildStatus: true,
          workSessions: {
            select: {
              hoursClaimed: true,
              hoursApproved: true,
            },
          },
          badges: true,
        },
      },
      roles: {
        select: { id: true, role: true, grantedAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const usersWithStats = users.map((user) => ({
    ...user,
    roles: user.roles,
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
