import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { sanitize } from "@/lib/sanitize"
import { AttendanceStatus, AttendanceCandidateSource } from "@/app/generated/prisma/enums"

const VALID_SOURCES: AttendanceCandidateSource[] = ["STASIS_USER", "REVIEWER_INCENTIVE", "EXTERNAL_HC", "DISCRETION"]
const VALID_STATUSES: AttendanceStatus[] = ["IDENTIFIED", "CONTACTED", "SOFT_YES", "CONFIRMED_YES", "DECLINED", "SHELVED"]

interface ImportItem {
  userId?: string
  externalName?: string
  externalEmail?: string
  externalSlackId?: string
  externalImage?: string
  source?: AttendanceCandidateSource
  outreachStatus?: AttendanceStatus
  caseForThem?: string
  statusNote?: string
  isGirl?: boolean
  homeAirport?: string
  homeCity?: string
  flightStipendCents?: number
  flightCostEstimateCents?: number
  invitedAt?: string
}

/**
 * POST /api/admin/attendance/bulk-import
 * Body: { items: ImportItem[] }
 *
 * Idempotent on userId / externalEmail (skips existing candidates rather than
 * creating duplicates). Designed for one-time backfills (e.g. populating from
 * Attend) and Claude-driven sourcing imports.
 */
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission(Permission.MANAGE_ATTENDANCE)
  if (authCheck.error) return authCheck.error

  const body = await request.json().catch(() => ({}))
  const items: ImportItem[] = Array.isArray(body.items) ? body.items.slice(0, 1000) : []
  if (items.length === 0) {
    return NextResponse.json({ error: "items required" }, { status: 400 })
  }

  const actorId = authCheck.session!.user.id

  // Pre-resolve user pronouns so we can auto-derive isGirl
  const userIds = items.map((i) => i.userId).filter((u): u is string => !!u)
  const users = userIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, pronouns: true } })
    : []
  const pronounsByUserId = new Map(users.map((u) => [u.id, u.pronouns]))

  // Existing rows we must skip
  const existing = await prisma.attendanceCandidate.findMany({
    where: {
      OR: [
        userIds.length > 0 ? { userId: { in: userIds } } : { id: "__never__" },
        ...items
          .filter((i) => !i.userId && i.externalEmail)
          .map((i) => ({ externalEmail: i.externalEmail!.toLowerCase() })),
      ],
    },
    select: { id: true, userId: true, externalEmail: true },
  })
  const existingUserIds = new Set(existing.filter((e) => e.userId).map((e) => e.userId!))
  const existingExternalEmails = new Set(existing.filter((e) => e.externalEmail).map((e) => e.externalEmail!))

  const created: string[] = []
  const skipped: Array<{ key: string; reason: string }> = []

  for (const it of items) {
    const userId = typeof it.userId === "string" ? it.userId : null
    const externalEmail = typeof it.externalEmail === "string" ? it.externalEmail.toLowerCase() : null
    const key = userId ?? externalEmail ?? it.externalName ?? "?"

    if (userId && existingUserIds.has(userId)) {
      skipped.push({ key, reason: "userId already imported" })
      continue
    }
    if (!userId && externalEmail && existingExternalEmails.has(externalEmail)) {
      skipped.push({ key, reason: "externalEmail already imported" })
      continue
    }
    if (!userId && !it.externalName) {
      skipped.push({ key, reason: "no userId or externalName" })
      continue
    }

    const source: AttendanceCandidateSource =
      it.source && VALID_SOURCES.includes(it.source)
        ? it.source
        : (userId ? "STASIS_USER" : "DISCRETION")

    const status: AttendanceStatus =
      it.outreachStatus && VALID_STATUSES.includes(it.outreachStatus)
        ? it.outreachStatus
        : "IDENTIFIED"

    let isGirl: boolean | null = typeof it.isGirl === "boolean" ? it.isGirl : null
    if (isGirl === null && userId) {
      const p = pronounsByUserId.get(userId)
      if (p && p.toLowerCase() === "she/her") isGirl = true
    }

    const invitedAt = (() => {
      if (status === "IDENTIFIED") return null
      if (typeof it.invitedAt === "string") {
        const d = new Date(it.invitedAt)
        if (!isNaN(d.getTime())) return d
      }
      return new Date()
    })()

    const created_ = await prisma.attendanceCandidate.create({
      data: {
        userId,
        externalName: userId ? null : (it.externalName ? sanitize(it.externalName).slice(0, 200) : null),
        externalEmail: userId ? null : externalEmail,
        externalSlackId: userId ? null : (it.externalSlackId ? sanitize(it.externalSlackId).slice(0, 50) : null),
        externalImage: userId ? null : (it.externalImage ? sanitize(it.externalImage).slice(0, 500) : null),
        outreachStatus: status,
        source,
        isGirl,
        invitedAt,
        caseForThem: it.caseForThem ? sanitize(it.caseForThem).slice(0, 1000) : null,
        statusNote: it.statusNote ? sanitize(it.statusNote).slice(0, 500) : null,
        homeAirport: it.homeAirport ? sanitize(it.homeAirport).slice(0, 8).toUpperCase() : null,
        homeCity: it.homeCity ? sanitize(it.homeCity).slice(0, 200) : null,
        flightStipendCents: typeof it.flightStipendCents === "number" ? Math.round(it.flightStipendCents) : null,
        flightCostEstimateCents: typeof it.flightCostEstimateCents === "number" ? Math.round(it.flightCostEstimateCents) : null,
        flightCostUpdatedAt: typeof it.flightCostEstimateCents === "number" ? new Date() : null,
        createdById: actorId,
      },
    })
    created.push(created_.id)
    if (userId) existingUserIds.add(userId)
    if (externalEmail) existingExternalEmails.add(externalEmail)
  }

  return NextResponse.json({ ok: true, created: created.length, skipped: skipped.length, skippedDetail: skipped, ids: created })
}
