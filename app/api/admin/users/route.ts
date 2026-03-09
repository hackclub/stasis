import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { SHOP_ITEM_IDS } from "@/lib/shop"

export async function GET(request: NextRequest) {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const { searchParams } = request.nextUrl
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")))
  const search = searchParams.get("search") || ""
  const filterFraud = searchParams.get("fraud")
  const filterRole = searchParams.get("role")
  const filterAddress = searchParams.get("address")
  const filterPronouns = searchParams.get("pronouns")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conditions: any[] = []

  if (search) {
    conditions.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { slackId: { contains: search, mode: "insensitive" } },
        { id: { contains: search, mode: "insensitive" } },
      ],
    })
  }

  if (filterFraud === "true") {
    conditions.push({ fraudConvicted: true })
  } else if (filterFraud === "false") {
    conditions.push({ fraudConvicted: false })
  }

  if (filterRole) {
    conditions.push({ roles: { some: { role: filterRole } } })
  }

  if (filterAddress === "true") {
    conditions.push({
      encryptedAddressStreet: { not: null },
      encryptedAddressCity: { not: null },
      encryptedAddressCountry: { not: null },
    })
  } else if (filterAddress === "false") {
    conditions.push({
      OR: [
        { encryptedAddressStreet: null },
        { encryptedAddressCity: null },
        { encryptedAddressCountry: null },
      ],
    })
  }

  if (filterPronouns) {
    if (filterPronouns === "none") {
      conditions.push({ pronouns: null })
    } else {
      conditions.push({ pronouns: { contains: filterPronouns, mode: "insensitive" } })
    }
  }

  if (conditions.length > 0) {
    where.AND = conditions
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        fraudConvicted: true,
        slackId: true,
        verificationStatus: true,
        pronouns: true,
        eventPreference: true,
        encryptedAddressStreet: true,
        encryptedAddressCity: true,
        encryptedAddressState: true,
        encryptedAddressZip: true,
        encryptedAddressCountry: true,
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
        currencyTransactions: {
          where: { type: "SHOP_PURCHASE", shopItemId: { not: null } },
          select: { amount: true, shopItemId: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

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
    hasAddress: !!(user.encryptedAddressStreet && user.encryptedAddressCity && user.encryptedAddressCountry),
    encryptedAddressStreet: undefined,
    encryptedAddressCity: undefined,
    encryptedAddressState: undefined,
    encryptedAddressZip: undefined,
    encryptedAddressCountry: undefined,
    hasEventInvite: user.currencyTransactions.some(
      (t) => t.shopItemId === SHOP_ITEM_IDS.STASIS_EVENT_INVITE
    ),
    flightStipend: user.currencyTransactions
      .filter((t) => t.shopItemId === SHOP_ITEM_IDS.FLIGHT_STIPEND)
      .reduce((acc, t) => acc + Math.abs(t.amount), 0),
    shopPurchaseCount: user.currencyTransactions.filter(
      (t) =>
        t.shopItemId !== SHOP_ITEM_IDS.STASIS_EVENT_INVITE &&
        t.shopItemId !== SHOP_ITEM_IDS.FLIGHT_STIPEND
    ).length,
    currencyTransactions: undefined,
  }))

  return NextResponse.json({
    items: usersWithStats,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
}
