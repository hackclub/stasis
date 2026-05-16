import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/admin-auth"
import { logAudit, AuditAction } from "@/lib/audit"
import { checkInventoryLookupRateLimit } from "@/lib/inventory/lookup-rate-limit"
import { Permission } from "@/lib/permissions"
import prisma from "@/lib/prisma"

function normalizeIdentifier(value: string) {
  return decodeURIComponent(value)
    .trim()
    .replace(/^<@/, "")
    .replace(/\|.*>$/, "")
    .replace(/>$/, "")
    .replace(/^@/, "")
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slackUserId: string }> }
) {
  const authCheck = await requirePermission(Permission.INVENTORY_FULFILL)
  if ("error" in authCheck) return authCheck.error

  const rateLimit = checkInventoryLookupRateLimit(authCheck.session.user.id)
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many lookup requests" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    )
  }

  const { slackUserId } = await params
  const rawIdentifier = decodeURIComponent(slackUserId).trim()
  const identifier = normalizeIdentifier(slackUserId)

  const userSelect = {
    id: true,
    email: true,
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

  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { id: rawIdentifier },
        { id: identifier },
        { slackId: rawIdentifier },
        { slackId: identifier },
        { nfcId: rawIdentifier },
        { nfcId: identifier },
        { email: { equals: rawIdentifier, mode: "insensitive" } },
        { email: { equals: identifier, mode: "insensitive" } },
      ],
    },
    select: userSelect,
  })

  if (!user && identifier.length >= 3) {
    const terms = identifier.split(/\s+/).filter(Boolean).slice(0, 4)
    const matches = await prisma.user.findMany({
      where: {
        AND: terms.map((term) => ({
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { slackDisplayName: { contains: term, mode: "insensitive" } },
            { email: { startsWith: term, mode: "insensitive" } },
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

  await logAudit({
    action: AuditAction.INVENTORY_LOOKUP,
    actorId: authCheck.session.user.id,
    actorEmail: authCheck.session.user.email,
    targetType: "User",
    targetId: user.id,
    metadata: { query: rawIdentifier },
  })

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
        status: { in: ["CHECKED_OUT", "RETURN_REQUESTED"] },
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
    },
    team: user.team,
    activeOrder,
    activeRentals,
  })
}
