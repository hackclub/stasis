import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"

export async function GET() {
  const adminCheck = await requireAdmin()
  if (adminCheck.error) return adminCheck.error

  const projects = await prisma.project.findMany({
    where: { status: "in_review" },
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
