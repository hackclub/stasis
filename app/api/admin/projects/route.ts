import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

export async function GET() {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { designStatus: { in: ["in_review", "update_requested"] } },
        { buildStatus: { in: ["in_review", "update_requested"] } },
      ],
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
      workSessions: {
        include: { media: true },
        orderBy: { createdAt: "desc" },
      },
      badges: true,
    },
    orderBy: { createdAt: "desc" },
  })

  const projectsWithHours = projects.map((project) => ({
    ...project,
    totalHoursClaimed: project.workSessions.reduce(
      (acc, s) => acc + s.hoursClaimed,
      0
    ),
    totalHoursApproved: project.workSessions.reduce(
      (acc, s) => acc + (s.hoursApproved ?? 0),
      0
    ),
  }))

  return NextResponse.json(projectsWithHours)
}
