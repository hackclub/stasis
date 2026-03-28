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

  // Try slackId first, then nfcId (for HID badge readers that send tag UIDs)
  const userSelect = {
    id: true,
    name: true,
    slackId: true,
    slackDisplayName: true,
    nfcId: true,
    image: true,
    teamId: true,
    team: {
      select: {
        id: true,
        name: true,
      },
    },
  } as const

  let user = await prisma.user.findUnique({
    where: { slackId: slackUserId },
    select: userSelect,
  })

  if (!user) {
    user = await prisma.user.findUnique({
      where: { nfcId: slackUserId },
      select: userSelect,
    })
  }

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
        slackId: user.slackId,
        nfcId: user.nfcId,
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
        status: { notIn: ["COMPLETED", "CANCELLED"] },
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
      slackId: user.slackId,
      nfcId: user.nfcId,
      image: user.image,
    },
    team: user.team,
    activeOrder,
    activeRentals,
  })
}
