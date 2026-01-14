import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireAdmin()
  if (adminCheck.error) return adminCheck.error

  const { id } = await params

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      projects: {
        include: {
          workSessions: {
            include: { media: true },
            orderBy: { createdAt: "desc" },
          },
          badges: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const userWithStats = {
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
  }

  return NextResponse.json(userWithStats)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireAdmin()
  if (adminCheck.error) return adminCheck.error

  const { id } = await params
  const body = await request.json()

  const { isAdmin, fraudConvicted } = body

  const updateData: { isAdmin?: boolean; fraudConvicted?: boolean } = {}
  if (typeof isAdmin === "boolean") updateData.isAdmin = isAdmin
  if (typeof fraudConvicted === "boolean") updateData.fraudConvicted = fraudConvicted

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
  })

  return NextResponse.json(user)
}
