import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { sanitize } from "@/lib/sanitize"
import { AttendanceStatus, AttendanceCandidateSource } from "@/app/generated/prisma/enums"
import { getDerivedStatsBatch } from "@/lib/attendance"

const VALID_SOURCES: AttendanceCandidateSource[] = ["STASIS_USER", "REVIEWER_INCENTIVE", "EXTERNAL_HC", "DISCRETION"]

/**
 * GET /api/admin/attendance
 * Returns the full curated attendance list (denormalized for the dashboard).
 * Includes per-row derivedStats (effort signals + reviewer progress).
 */
export async function GET() {
  const authCheck = await requirePermission(Permission.MANAGE_ATTENDANCE)
  if (authCheck.error) return authCheck.error

  const candidates = await prisma.attendanceCandidate.findMany({
    orderBy: [{ outreachStatus: "asc" }, { updatedAt: "desc" }],
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          slackId: true,
          pronouns: true,
        },
      },
      owner: { select: { id: true, name: true, email: true, image: true } },
      _count: { select: { commsEntries: true, reminders: true } },
    },
  })

  const [statsByCandidate, lastComms] = await Promise.all([
    getDerivedStatsBatch(
      candidates.map((c) => ({ id: c.id, userId: c.userId, source: c.source }))
    ),
    prisma.attendanceCommsEntry.findMany({
      where: { candidateId: { in: candidates.map((c) => c.id) } },
      orderBy: { createdAt: "desc" },
      distinct: ["candidateId"],
      select: { candidateId: true, createdAt: true, text: true, authorId: true },
    }),
  ])

  const lastCommsByCandidate = new Map(lastComms.map((c) => [c.candidateId, c]))

  const items = candidates.map((c) => {
    const stats = statsByCandidate.get(c.id)!
    const last = lastCommsByCandidate.get(c.id) ?? null
    return {
      id: c.id,
      userId: c.userId,
      // identity (pulled from user when linked, else external fields)
      name: c.user?.name ?? c.externalName ?? null,
      email: c.user?.email ?? c.externalEmail ?? null,
      slackId: c.user?.slackId ?? c.externalSlackId ?? null,
      image: c.user?.image ?? c.externalImage ?? null,
      pronouns: c.user?.pronouns ?? null,
      // pipeline
      outreachStatus: c.outreachStatus,
      source: c.source,
      ownerId: c.ownerId,
      owner: c.owner,
      invitedAt: c.invitedAt,
      // demographics
      isGirl: c.isGirl,
      // logistics
      homeAirport: c.homeAirport,
      homeCity: c.homeCity,
      flightCostEstimateCents: c.flightCostEstimateCents,
      flightCostUpdatedAt: c.flightCostUpdatedAt,
      flightStipendCents: c.flightStipendCents,
      // attend
      attendInvited: c.attendInvited,
      attendOnboardingStarted: c.attendOnboardingStarted,
      attendFlightBooked: c.attendFlightBooked,
      attendCity: c.attendCity,
      attendState: c.attendState,
      attendCountry: c.attendCountry,
      attendCachedAt: c.attendCachedAt,
      // derived stats
      derivedStats: stats,
      // notes / comms summary
      notes: c.notes,
      commsCount: c._count.commsEntries,
      remindersCount: c._count.reminders,
      lastComms: last
        ? { createdAt: last.createdAt, text: last.text.slice(0, 140), authorId: last.authorId }
        : null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }
  })

  return NextResponse.json({ items })
}

/**
 * POST /api/admin/attendance
 * Create a new candidate. Either:
 *   { userId, source?, ... }                 – link to existing Stasis user
 *   { externalName, externalEmail?, externalSlackId?, source?, ... } – external
 *
 * Optional fields at creation: notes, outreachStatus, isGirl,
 * flightStipendCents, flightCostEstimateCents, homeAirport, homeCity.
 *
 * isGirl is auto-derived from she/her pronouns if not provided.
 */
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission(Permission.MANAGE_ATTENDANCE)
  if (authCheck.error) return authCheck.error

  const body = await request.json().catch(() => ({}))
  const userId = typeof body.userId === "string" ? body.userId : null
  const externalName = typeof body.externalName === "string" ? sanitize(body.externalName).slice(0, 200) : null
  const externalEmail = typeof body.externalEmail === "string" ? sanitize(body.externalEmail).slice(0, 200).toLowerCase() : null
  const externalSlackId = typeof body.externalSlackId === "string" ? sanitize(body.externalSlackId).slice(0, 50) : null

  if (!userId && !externalName) {
    return NextResponse.json({ error: "Must supply userId or externalName" }, { status: 400 })
  }

  const source: AttendanceCandidateSource =
    typeof body.source === "string" && VALID_SOURCES.includes(body.source)
      ? (body.source as AttendanceCandidateSource)
      : (userId ? "STASIS_USER" : "DISCRETION")

  const status: AttendanceStatus =
    typeof body.outreachStatus === "string" && body.outreachStatus in AttendanceStatus
      ? (body.outreachStatus as AttendanceStatus)
      : "IDENTIFIED"

  let isGirl: boolean | null = null
  if (typeof body.isGirl === "boolean") isGirl = body.isGirl

  let userPronouns: string | null = null
  if (userId) {
    const existing = await prisma.attendanceCandidate.findUnique({ where: { userId } })
    if (existing) {
      return NextResponse.json({ error: "Candidate already exists for this user", candidateId: existing.id }, { status: 409 })
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, pronouns: true } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })
    userPronouns = user.pronouns ?? null
  }

  // Auto-derive isGirl when caller didn't specify and pronouns indicate she/her
  if (isGirl === null && userPronouns && userPronouns.toLowerCase() === "she/her") {
    isGirl = true
  }

  const invitedAt = status === "IDENTIFIED" ? null : new Date()

  const candidate = await prisma.attendanceCandidate.create({
    data: {
      userId,
      externalName: userId ? null : externalName,
      externalEmail: userId ? null : externalEmail,
      externalSlackId: userId ? null : externalSlackId,
      createdById: authCheck.session!.user.id,
      outreachStatus: status,
      source,
      isGirl,
      invitedAt,
      notes: typeof body.notes === "string" ? body.notes.slice(0, 50_000) : null,
      flightStipendCents: typeof body.flightStipendCents === "number" ? Math.round(body.flightStipendCents) : null,
      flightCostEstimateCents: typeof body.flightCostEstimateCents === "number" ? Math.round(body.flightCostEstimateCents) : null,
      homeAirport: typeof body.homeAirport === "string" ? sanitize(body.homeAirport).slice(0, 8).toUpperCase() : null,
      homeCity: typeof body.homeCity === "string" ? sanitize(body.homeCity).slice(0, 200) : null,
    },
  })

  return NextResponse.json({ id: candidate.id })
}
