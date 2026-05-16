import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { logAudit, AuditAction } from "@/lib/audit"
import { checkInventoryLookupRateLimit } from "@/lib/inventory/lookup-rate-limit"
import { Permission } from "@/lib/permissions"
import type { Prisma } from "@/app/generated/prisma/client"

const MAX_RESULTS = 8

function searchableTerm(term: string): Prisma.UserWhereInput {
  return {
    OR: [
      { name: { contains: term, mode: "insensitive" } },
      { slackDisplayName: { contains: term, mode: "insensitive" } },
      { email: { startsWith: term, mode: "insensitive" } },
      { slackId: { startsWith: term, mode: "insensitive" } },
      { nfcId: { startsWith: term, mode: "insensitive" } },
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
  const authCheck = await requirePermission(Permission.INVENTORY_FULFILL)
  if ("error" in authCheck) return authCheck.error

  const rateLimit = checkInventoryLookupRateLimit(authCheck.session.user.id)
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many lookup requests" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    )
  }

  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80)
  if (query.length < 3) {
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
    },
    take: 16,
  })

  const results = users
    .sort((a, b) => {
      const byScore = scoreUser(a, query, terms) - scoreUser(b, query, terms)
      if (byScore !== 0) return byScore
      return (a.name ?? a.slackDisplayName ?? a.email).localeCompare(b.name ?? b.slackDisplayName ?? b.email)
    })
    .slice(0, MAX_RESULTS)
    .map((user) => ({
      id: user.id,
      name: user.name ?? user.slackDisplayName ?? user.email,
      slackDisplayName: user.slackDisplayName,
      image: user.image,
    }))

  await Promise.all(
    results.map((user) =>
      logAudit({
        action: AuditAction.INVENTORY_LOOKUP,
        actorId: authCheck.session.user.id,
        actorEmail: authCheck.session.user.email,
        targetType: "User",
        targetId: user.id,
        metadata: { query },
      })
    )
  )

  return NextResponse.json({ results })
}
