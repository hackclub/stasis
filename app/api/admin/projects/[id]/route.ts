import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
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
      bomItems: {
        orderBy: { createdAt: "desc" },
      },
      reviewActions: {
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const totalHoursClaimed = project.workSessions.reduce(
    (acc, s) => acc + s.hoursClaimed,
    0
  )
  const totalHoursApproved = project.workSessions.reduce(
    (acc, s) => acc + (s.hoursApproved ?? 0),
    0
  )

  return NextResponse.json({ ...project, totalHoursClaimed, totalHoursApproved })
}
