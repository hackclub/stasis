import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { SHOP_ITEM_IDS } from "@/lib/shop"

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

  return NextResponse.json(usersWithStats)
}
