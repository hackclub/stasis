import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import {
  TAMAGOTCHI_EVENT,
  getEventDayDates,
  getWindowDates,
  findStreakStart,
  getLocalDateStr,
  getEffectiveDate,
  validateTimezone,
  isEventActive,
  isEventVisible,
  canStillComplete,
  computeStreaks,
  type TamagotchiDay,
  type TamagotchiStatus,
} from "@/lib/tamagotchi"
import { checkAndCreateStreakReward } from "@/lib/tamagotchi-reward"

/**
 * GET /api/tamagotchi/status?tz=America/New_York
 *
 * Returns the authenticated user's Tamagotchi Streak Challenge status.
 * Uses the user's timezone for day boundaries with a 30-min grace period.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id
  const tz = validateTimezone(request.nextUrl.searchParams.get("tz"))
  const now = new Date()
  const today = getLocalDateStr(now, tz)

  // Persist the user's timezone for batch recomputation of NULL-effectiveDate sessions
  prisma.user.update({ where: { id: userId }, data: { timezone: tz } }).catch(() => {})

  if (!isEventVisible(today)) {
    return NextResponse.json({
      eventActive: false,
      eventVisible: false,
      windowDays: [],
      pastDays: [],
      futureDays: [],
      currentStreak: 0,
      bestStreak: 0,
      challengeComplete: false,
      canStillComplete: false,
      todayProgress: { hasJournal: false, complete: false },
      reward: null,
      recentProjectId: null,
      graceDays: [],
    } satisfies TamagotchiStatus)
  }

  // Widen fetch window by 1 day on each side to account for grace period
  const fetchStart = new Date(TAMAGOTCHI_EVENT.START + "T00:00:00Z")
  fetchStart.setUTCDate(fetchStart.getUTCDate() - 1)
  const fetchEnd = new Date(TAMAGOTCHI_EVENT.END + "T00:00:00Z")
  fetchEnd.setUTCDate(fetchEnd.getUTCDate() + 2)

  const workSessions = await prisma.workSession.findMany({
    where: {
      project: { userId },  // Include sessions from soft-deleted projects for streak continuity
      createdAt: {
        gte: fetchStart,
        lt: fetchEnd,
      },
    },
    select: {
      createdAt: true,
      content: true,
      effectiveDate: true,
    },
  })

  // Fetch grace days for this user
  const graceDayRecords = await prisma.streakGraceDay.findMany({
    where: { userId },
    select: { date: true },
  })
  const graceDayDates = new Set(graceDayRecords.map(g => g.date))

  // Group by effective date — prefer stored effectiveDate (set at creation time in user's TZ),
  // fall back to computing from createdAt + current TZ for older sessions without it
  const dayMap = new Map<string, { hasJournal: boolean; sessions: number }>()
  for (const ws of workSessions) {
    const dateStr = ws.effectiveDate ?? getEffectiveDate(ws.createdAt, tz)
    // Clamp to event window
    if (dateStr < TAMAGOTCHI_EVENT.START || dateStr > TAMAGOTCHI_EVENT.END) continue
    const existing = dayMap.get(dateStr) || { hasJournal: false, sessions: 0 }
    if (ws.content && ws.content.trim().length > 0) {
      existing.hasJournal = true
    }
    existing.sessions += 1
    dayMap.set(dateStr, existing)
  }

  // Build the full 18-day array for streak computation
  const eventDates = getEventDayDates()
  const allDays: TamagotchiDay[] = eventDates.map((date) => {
    const data = dayMap.get(date)
    const hasJournal = data?.hasJournal ?? false
    const isToday = date === today
    const isFuture = date > today

    return {
      date,
      completed: hasJournal,
      hasJournal,
      sessions: data?.sessions ?? 0,
      isToday,
      isFuture,
      isGraceDay: graceDayDates.has(date) && !hasJournal,
    }
  })

  // Compute streaks across all event days
  const { currentStreak, bestStreak, challengeComplete } = computeStreaks(allDays)

  // Find where the current streak attempt starts
  const streakStart = findStreakStart(allDays, today)

  // Split into window / past / future (grace days excluded from all three — shown as X on lines)
  const windowDateStrs = getWindowDates(streakStart, graceDayDates)
  const windowDays = allDays.filter(d => windowDateStrs.includes(d.date))
  const pastDays = allDays.filter(d => d.date < streakStart && d.date >= TAMAGOTCHI_EVENT.START && !d.isGraceDay)
  const lastWindowDate = windowDateStrs[windowDateStrs.length - 1] ?? today
  const futureDays = allDays.filter(d => d.date > lastWindowDate && d.date <= TAMAGOTCHI_EVENT.END && !d.isGraceDay)

  // Today's progress
  const todayData = dayMap.get(today)
  const todayProgress = {
    hasJournal: todayData?.hasJournal ?? false,
    complete: todayData?.hasJournal ?? false,
  }

  // Create reward if challenge is complete (also catches users who completed
  // before the session-creation check was added). Uses stored TZ for NULL
  // effectiveDate sessions and handles race conditions via upsert.
  const streakReward = challengeComplete
    ? await checkAndCreateStreakReward(userId, tz)
    : await prisma.streakReward.findUnique({ where: { userId } })

  const reward: TamagotchiStatus["reward"] = streakReward
    ? {
        completedAt: streakReward.completedAt.toISOString(),
        claimed: streakReward.claimed,
        shipped: streakReward.shipped,
      }
    : null

  // Get most recent project for CTA
  const recentProject = await prisma.project.findFirst({
    where: { userId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  })

  return NextResponse.json({
    eventActive: isEventActive(today),
    eventVisible: true,
    windowDays,
    pastDays,
    futureDays,
    currentStreak,
    bestStreak,
    challengeComplete: challengeComplete || reward !== null,
    canStillComplete: canStillComplete(today, currentStreak),
    todayProgress,
    reward,
    recentProjectId: recentProject?.id ?? null,
    graceDays: graceDayRecords
      .filter(g => g.date >= TAMAGOTCHI_EVENT.START && g.date <= TAMAGOTCHI_EVENT.END)
      .map(g => ({ date: g.date })),
  } satisfies TamagotchiStatus)
}
