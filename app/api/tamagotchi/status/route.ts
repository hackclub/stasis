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
    } satisfies TamagotchiStatus)
  }

  // Widen fetch window by 1 day on each side to account for grace period
  const fetchStart = new Date(TAMAGOTCHI_EVENT.START + "T00:00:00Z")
  fetchStart.setUTCDate(fetchStart.getUTCDate() - 1)
  const fetchEnd = new Date(TAMAGOTCHI_EVENT.END + "T00:00:00Z")
  fetchEnd.setUTCDate(fetchEnd.getUTCDate() + 2)

  const workSessions = await prisma.workSession.findMany({
    where: {
      project: { userId, deletedAt: null },
      createdAt: {
        gte: fetchStart,
        lt: fetchEnd,
      },
    },
    select: {
      createdAt: true,
      content: true,
    },
  })

  // Group by effective date (applying grace period + user timezone)
  const dayMap = new Map<string, { hasJournal: boolean; sessions: number }>()
  for (const ws of workSessions) {
    const dateStr = getEffectiveDate(ws.createdAt, tz)
    // Clamp to event window
    if (dateStr < TAMAGOTCHI_EVENT.START || dateStr > TAMAGOTCHI_EVENT.END) continue
    const existing = dayMap.get(dateStr) || { hasJournal: false, sessions: 0 }
    if (ws.content && ws.content.trim().length > 0) {
      existing.hasJournal = true
    }
    existing.sessions += 1
    dayMap.set(dateStr, existing)
  }

  // Build the full 14-day array for streak computation
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
    }
  })

  // Compute streaks across all event days
  const { currentStreak, bestStreak, challengeComplete } = computeStreaks(allDays)

  // Find where the current streak attempt starts
  const streakStart = findStreakStart(allDays, today)

  // Split into window / past / future
  const windowDateStrs = getWindowDates(streakStart)
  const windowDays = allDays.filter(d => windowDateStrs.includes(d.date))
  const pastDays = allDays.filter(d => d.date < streakStart && d.date >= TAMAGOTCHI_EVENT.START)
  const lastWindowDate = windowDateStrs[windowDateStrs.length - 1] ?? today
  const futureDays = allDays.filter(d => d.date > lastWindowDate && d.date <= TAMAGOTCHI_EVENT.END)

  // Today's progress
  const todayData = dayMap.get(today)
  const todayProgress = {
    hasJournal: todayData?.hasJournal ?? false,
    complete: todayData?.hasJournal ?? false,
  }

  // Check / create reward
  let reward: TamagotchiStatus["reward"] = null
  if (challengeComplete) {
    let existing = await prisma.streakReward.findUnique({ where: { userId } })
    if (!existing) {
      existing = await prisma.streakReward.create({
        data: { userId, completedAt: new Date() },
      })
    }
    reward = {
      completedAt: existing.completedAt.toISOString(),
      claimed: existing.claimed,
      shipped: existing.shipped,
    }
  } else {
    const existing = await prisma.streakReward.findUnique({ where: { userId } })
    if (existing) {
      reward = {
        completedAt: existing.completedAt.toISOString(),
        claimed: existing.claimed,
        shipped: existing.shipped,
      }
    }
  }

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
    canStillComplete: canStillComplete(today),
    todayProgress,
    reward,
    recentProjectId: recentProject?.id ?? null,
  } satisfies TamagotchiStatus)
}
