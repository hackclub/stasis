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
  const identifier = slackUserId.trim()

  const userSelect = {
    id: true,
    email: true,
    name: true,
    slackId: true,
    slackDisplayName: true,
    nfcId: true,
    image: true,
    attendRegisteredAt: true,
    teamId: true,
    team: {
      select: {
        id: true,
        name: true,
      },
    },
  } as const

  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { id: identifier },
        { slackId: identifier },
        { nfcId: identifier },
        { email: { equals: identifier, mode: "insensitive" } },
      ],
    },
    select: userSelect,
  })

  if (!user && identifier.length >= 2) {
    const terms = identifier.split(/\s+/).filter(Boolean).slice(0, 4)
    const matches = await prisma.user.findMany({
      where: {
        AND: terms.map((term) => ({
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { slackDisplayName: { contains: term, mode: "insensitive" } },
            { email: { contains: term, mode: "insensitive" } },
          ],
        })),
      },
      select: userSelect,
      take: 2,
    })
    if (matches.length === 1) user = matches[0]
  }

  if (!user) {
    return NextResponse.json(
      { error: "User not found" },
      { status: 404 }
    )
  }

  const stasisTicketPurchase = await prisma.currencyTransaction.findFirst({
    where: {
      userId: user.id,
      type: "SHOP_PURCHASE",
      shopItemId: "stasis-event-invite",
    },
    select: { id: true },
  })
  const hasStasisTicket = Boolean(user.attendRegisteredAt || stasisTicketPurchase)

  if (!user.teamId) {
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name ?? user.slackDisplayName ?? user.email,
        slackId: user.slackId,
        slackDisplayName: user.slackDisplayName,
        nfcId: user.nfcId,
        image: user.image,
        hasStasisTicket,
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
      email: user.email,
      name: user.name ?? user.slackDisplayName ?? user.email,
      slackId: user.slackId,
      slackDisplayName: user.slackDisplayName,
      nfcId: user.nfcId,
      image: user.image,
      hasStasisTicket,
    },
    team: user.team,
    activeOrder,
    activeRentals,
  })
}
