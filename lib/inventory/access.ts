import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { getUserRoles, hasRole, Role } from "@/lib/permissions"
import { MIN_BITS_FOR_INVENTORY } from "./config"

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

  if (isAdmin) {
    return {
      allowed: true,
      isAdmin: true,
      teamId: user?.teamId ?? null,
      teamName: user?.team?.name ?? null,
      balance,
      enabled,
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
    }
  }

  if (balance < MIN_BITS_FOR_INVENTORY) {
    return {
      allowed: false,
      reason: `You need at least ${MIN_BITS_FOR_INVENTORY} bits to access inventory`,
      isAdmin: false,
      teamId: null,
      teamName: null,
      balance,
      enabled,
    }
  }

  return {
    allowed: true,
    isAdmin: false,
    teamId: user?.teamId ?? null,
    teamName: user?.team?.name ?? null,
    balance,
    enabled,
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
