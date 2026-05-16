import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { getUserRoles, hasRole, Role } from "@/lib/permissions"
import {
  VENUE_FLOORS,
  MAX_CONCURRENT_RENTALS,
  MAX_TEAM_SIZE,
} from "./config"

export async function checkInventoryAccess(userId: string) {
  const [settings, balanceResult, user, roles] = await Promise.all([
    prisma.inventorySettings.findUnique({ where: { id: "singleton" } }),
    prisma.currencyTransaction.aggregate({
      where: { userId },
      _sum: { amount: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        teamId: true,
        team: { select: { id: true, name: true } },
      },
    }),
    getUserRoles(userId),
  ])

  const isAdmin = hasRole(roles, Role.ADMIN)
  const enabled = settings?.enabled ?? false
  const balance = balanceResult._sum.amount ?? 0
  const allowMultipleOrders = process.env.INVENTORY_ALLOW_MULTIPLE_ORDERS === "true"
  const maxTeamSize = settings?.maxTeamSize ?? MAX_TEAM_SIZE
  const config = { venueFloors: VENUE_FLOORS, maxConcurrentRentals: MAX_CONCURRENT_RENTALS, maxTeamSize, allowMultipleOrders }

  if (isAdmin) {
    return {
      allowed: true,
      reason: null,
      isAdmin: true,
      teamId: user?.teamId ?? null,
      teamName: user?.team?.name ?? null,
      balance,
      enabled,
      ...config,
    }
  }

  if (!enabled) {
    return {
      allowed: false,
      reason: "Inventory is currently disabled",
      isAdmin: false,
      teamId: null,
      teamName: null,
      balance,
      enabled,
      ...config,
    }
  }

  return {
    allowed: true,
    reason: null,
    isAdmin: false,
    teamId: user?.teamId ?? null,
    teamName: user?.team?.name ?? null,
    balance,
    enabled,
    ...config,
  }
}

export async function requireInventoryAccess() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const access = await checkInventoryAccess(session.user.id)
  if (!access.allowed) {
    return {
      error: NextResponse.json(
        { error: access.reason ?? "Access denied" },
        { status: 403 }
      ),
    }
  }

  return { session, access }
}
