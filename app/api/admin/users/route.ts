import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { SHOP_ITEM_IDS } from "@/lib/shop"
import { decryptPII } from "@/lib/pii"

function safeDecrypt(value: string | null): string | null {
  if (!value) return null
  try {
    return decryptPII(value)
  } catch {
    return null
  }
}

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
  const sortBy = searchParams.get("sort") // "bits" to sort by total bits descending

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

  // When sorting by bits, get ordered user IDs via raw SQL
  let sortedUserIds: string[] | null = null
  if (sortBy === "bits") {
    // Build WHERE clause conditions for raw SQL
    const rawConditions: string[] = []
    const rawParams: unknown[] = []
    let paramIdx = 1

    if (search) {
      rawConditions.push(`(u."name" ILIKE $${paramIdx} OR u."email" ILIKE $${paramIdx} OR u."slackId" ILIKE $${paramIdx} OR u."id" ILIKE $${paramIdx})`)
      rawParams.push(`%${search}%`)
      paramIdx++
    }
    if (filterFraud === "true") {
      rawConditions.push(`u."fraudConvicted" = true`)
    } else if (filterFraud === "false") {
      rawConditions.push(`u."fraudConvicted" = false`)
    }
    if (filterRole) {
      rawConditions.push(`EXISTS (SELECT 1 FROM "user_role" ur WHERE ur."userId" = u."id" AND ur."role" = $${paramIdx})`)
      rawParams.push(filterRole)
      paramIdx++
    }
    if (filterAddress === "true") {
      rawConditions.push(`u."encryptedAddressStreet" IS NOT NULL AND u."encryptedAddressCity" IS NOT NULL AND u."encryptedAddressCountry" IS NOT NULL`)
    } else if (filterAddress === "false") {
      rawConditions.push(`(u."encryptedAddressStreet" IS NULL OR u."encryptedAddressCity" IS NULL OR u."encryptedAddressCountry" IS NULL)`)
    }
    if (filterPronouns) {
      if (filterPronouns === "none") {
        rawConditions.push(`u."pronouns" IS NULL`)
      } else {
        rawConditions.push(`u."pronouns" ILIKE $${paramIdx}`)
        rawParams.push(`%${filterPronouns}%`)
        paramIdx++
      }
    }

    const whereClause = rawConditions.length > 0 ? `WHERE ${rawConditions.join(" AND ")}` : ""
    const offsetVal = (page - 1) * limit

    const query = `
      SELECT u."id", COALESCE(SUM(ct."amount"), 0) as total_bits
      FROM "user" u
      LEFT JOIN "currency_transaction" ct ON ct."userId" = u."id"
      ${whereClause}
      GROUP BY u."id"
      ORDER BY total_bits DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `
    rawParams.push(limit, offsetVal)

    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(query, ...rawParams)
    sortedUserIds = rows.map((r) => r.id)
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where: sortedUserIds ? { ...where, id: { in: sortedUserIds } } : where,
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
        utmSource: true,
        signupPage: true,
        encryptedAddressStreet: true,
        encryptedAddressCity: true,
        encryptedAddressState: true,
        encryptedAddressZip: true,
        encryptedAddressCountry: true,
        projects: {
          select: {
            id: true,
            title: true,
            tier: true,
            bitsAwarded: true,
            bomTax: true,
            bomShipping: true,
            noBomNeeded: true,
            designStatus: true,
            buildStatus: true,
            workSessions: {
              select: {
                hoursClaimed: true,
                hoursApproved: true,
              },
            },
            badges: true,
            bomItems: {
              select: {
                totalCost: true,
                status: true,
              },
            },
          },
        },
        roles: {
          select: { id: true, role: true, grantedAt: true },
        },
        currencyTransactions: {
          select: { amount: true, shopItemId: true, type: true },
        },
      },
      orderBy: sortedUserIds ? undefined : { createdAt: "desc" },
      skip: sortedUserIds ? undefined : (page - 1) * limit,
      take: sortedUserIds ? undefined : limit,
    }),
  ])

  const usersWithStats = users.map((user) => {
    const shopTxns = user.currencyTransactions.filter(
      (t) => t.type === "SHOP_PURCHASE" && t.shopItemId !== null
    )
    const designBits = user.currencyTransactions
      .filter((t) => t.type === "DESIGN_APPROVED")
      .reduce((acc, t) => acc + t.amount, 0)
    const totalBits = user.currencyTransactions
      .reduce((acc, t) => acc + t.amount, 0)

    return {
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
      addressState: safeDecrypt(user.encryptedAddressState),
      addressCountry: safeDecrypt(user.encryptedAddressCountry),
      encryptedAddressStreet: undefined,
      encryptedAddressCity: undefined,
      encryptedAddressState: undefined,
      encryptedAddressZip: undefined,
      encryptedAddressCountry: undefined,
      designBits,
      totalBits,
      hasEventInvite: shopTxns.some(
        (t) => t.shopItemId === SHOP_ITEM_IDS.STASIS_EVENT_INVITE
      ),
      flightStipend: shopTxns
        .filter((t) => t.shopItemId === SHOP_ITEM_IDS.FLIGHT_STIPEND)
        .reduce((acc, t) => acc + Math.abs(t.amount), 0),
      shopPurchaseCount: shopTxns.filter(
        (t) =>
          t.shopItemId !== SHOP_ITEM_IDS.STASIS_EVENT_INVITE &&
          t.shopItemId !== SHOP_ITEM_IDS.FLIGHT_STIPEND
      ).length,
      currencyTransactions: undefined,
    }
  })

  // Preserve sort order from raw SQL when sorting by bits
  const sortedStats = sortedUserIds
    ? sortedUserIds.map((id) => usersWithStats.find((u) => u.id === id)!).filter(Boolean)
    : usersWithStats

  return NextResponse.json({
    items: sortedStats,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
}
