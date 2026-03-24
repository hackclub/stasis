import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import prisma from "@/lib/prisma"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slackUserId: string }> }
) {
  const adminCheck = await requireAdmin()
  if ("error" in adminCheck) return adminCheck.error

  const { slackUserId } = await params

  const user = await prisma.user.findUnique({
    where: { slackId: slackUserId },
    select: {
      id: true,
      name: true,
      slackDisplayName: true,
      image: true,
      teamId: true,
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  if (!user) {
    return NextResponse.json(
      { error: "User not found" },
      { status: 404 }
    )
  }

  if (!user.teamId) {
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.slackDisplayName ?? user.name,
        image: user.image,
      },
      team: null,
      activeOrder: null,
      activeRentals: [],
    })
  }

  const [activeOrder, activeRentals] = await Promise.all([
    prisma.order.findFirst({
      where: {
        teamId: user.teamId,
        status: { not: "COMPLETED" },
      },
      include: {
        items: { include: { item: true } },
        placedBy: {
          select: { name: true, slackDisplayName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.toolRental.findMany({
      where: {
        teamId: user.teamId,
        status: "CHECKED_OUT",
      },
      include: {
        tool: true,
        rentedBy: {
          select: { name: true, slackDisplayName: true },
        },
      },
    }),
  ])

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.slackDisplayName ?? user.name,
      image: user.image,
    },
    team: user.team,
    activeOrder,
    activeRentals,
  })
}
