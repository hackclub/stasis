import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import type { Prisma } from "@/app/generated/prisma/client"

const MAX_RESULTS = 8

function searchableTerm(term: string): Prisma.UserWhereInput {
  return {
    OR: [
      { name: { contains: term, mode: "insensitive" } },
      { slackDisplayName: { contains: term, mode: "insensitive" } },
      { email: { contains: term, mode: "insensitive" } },
      { slackId: { contains: term, mode: "insensitive" } },
      { nfcId: { contains: term, mode: "insensitive" } },
    ],
  }
}

function scoreUser(
  user: {
    id: string
    email: string
    name: string | null
    slackDisplayName: string | null
    slackId: string | null
    nfcId: string | null
  },
  query: string,
  terms: string[]
): number {
  const q = query.toLowerCase()
  const fields = [
    user.name,
    user.slackDisplayName,
    user.email,
    user.slackId,
    user.nfcId,
    user.id,
  ].map((value) => value?.toLowerCase() ?? "")

  if ([user.id, user.slackId, user.nfcId, user.email].some((value) => value?.toLowerCase() === q)) return 0
  if ([user.name, user.slackDisplayName, user.email].some((value) => value?.toLowerCase().startsWith(q))) return 1
  if (terms.length > 1 && terms.every((term) => fields.some((field) => field.includes(term)))) return 2
  if (fields.some((field) => field.includes(q))) return 3
  return 4
}

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin()
  if ("error" in adminCheck) return adminCheck.error

  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80)
  if (query.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 4)
  const where: Prisma.UserWhereInput = {
    OR: [
      searchableTerm(query),
      ...(terms.length > 1 ? [{ AND: terms.map(searchableTerm) }] : []),
    ],
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      slackId: true,
      slackDisplayName: true,
      nfcId: true,
      image: true,
      attendRegisteredAt: true,
    },
    take: 16,
  })

  const userIds = users.map((user) => user.id)
  const ticketRows = userIds.length > 0
    ? await prisma.currencyTransaction.findMany({
        where: {
          userId: { in: userIds },
          type: "SHOP_PURCHASE",
          shopItemId: "stasis-event-invite",
        },
        select: { userId: true },
        distinct: ["userId"],
      })
    : []
  const ticketUserIds = new Set(ticketRows.map((row) => row.userId))

  const results = users
    .sort((a, b) => {
      const byScore = scoreUser(a, query, terms) - scoreUser(b, query, terms)
      if (byScore !== 0) return byScore
      return (a.name ?? a.slackDisplayName ?? a.email).localeCompare(b.name ?? b.slackDisplayName ?? b.email)
    })
    .slice(0, MAX_RESULTS)
    .map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name ?? user.slackDisplayName ?? user.email,
      slackId: user.slackId,
      slackDisplayName: user.slackDisplayName,
      nfcId: user.nfcId,
      image: user.image,
      hasStasisTicket: Boolean(user.attendRegisteredAt || ticketUserIds.has(user.id)),
    }))

  return NextResponse.json({ results })
}
