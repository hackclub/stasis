import prisma from "@/lib/prisma"
import {
  TAMAGOTCHI_EVENT,
  getEventDayDates,
  getEffectiveDate,
  validateTimezone,
  computeStreaks,
  type TamagotchiDay,
} from "@/lib/tamagotchi"

/**
 * Check whether a user has completed the Tamagotchi streak challenge and
 * create a StreakReward if they have. Safe to call multiple times — does
 * nothing if the reward already exists.
 *
 * @param userId  The user to check
 * @param tz      Optional IANA timezone for recomputing NULL-effectiveDate sessions.
 *                Falls back to the user's stored timezone, then America/New_York.
 * @returns The StreakReward if the challenge is complete, null otherwise
 */
export async function checkAndCreateStreakReward(userId: string, tz?: string) {
  // Fast path: reward already exists
  const existing = await prisma.streakReward.findUnique({ where: { userId } })
  if (existing) return existing

  // Resolve timezone: explicit param > stored on user > fallback
  let resolvedTz = tz
  if (!resolvedTz) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    })
    resolvedTz = user?.timezone ?? undefined
  }
  const validTz = validateTimezone(resolvedTz)

  // Widen fetch window by 1 day on each side for grace period
  const fetchStart = new Date(TAMAGOTCHI_EVENT.START + "T00:00:00Z")
  fetchStart.setUTCDate(fetchStart.getUTCDate() - 1)
  const fetchEnd = new Date(TAMAGOTCHI_EVENT.END + "T00:00:00Z")
  fetchEnd.setUTCDate(fetchEnd.getUTCDate() + 2)

  const workSessions = await prisma.workSession.findMany({
    where: {
      project: { userId },
      createdAt: { gte: fetchStart, lt: fetchEnd },
    },
    select: { createdAt: true, content: true, effectiveDate: true },
  })

  const graceDayRecords = await prisma.streakGraceDay.findMany({
    where: { userId },
    select: { date: true },
  })
  const graceDayDates = new Set(graceDayRecords.map((g) => g.date))

  // Group sessions by effective date
  const dayMap = new Map<string, { hasJournal: boolean }>()
  for (const ws of workSessions) {
    const dateStr = ws.effectiveDate ?? getEffectiveDate(ws.createdAt, validTz)
    if (dateStr < TAMAGOTCHI_EVENT.START || dateStr > TAMAGOTCHI_EVENT.END) continue
    const entry = dayMap.get(dateStr) || { hasJournal: false }
    if (ws.content && ws.content.trim().length > 0) {
      entry.hasJournal = true
    }
    dayMap.set(dateStr, entry)
  }

  // Build days array and compute streaks
  const eventDates = getEventDayDates()
  const today = new Date().toISOString().slice(0, 10)
  const allDays: TamagotchiDay[] = eventDates.map((date) => {
    const data = dayMap.get(date)
    const hasJournal = data?.hasJournal ?? false
    return {
      date,
      completed: hasJournal,
      hasJournal,
      sessions: 0,
      isToday: date === today,
      isFuture: date > today,
      isGraceDay: graceDayDates.has(date) && !hasJournal,
    }
  })

  const { challengeComplete } = computeStreaks(allDays)
  if (!challengeComplete) return null

  // Create reward — use upsert to handle race conditions
  return prisma.streakReward.upsert({
    where: { userId },
    create: { userId, completedAt: new Date() },
    update: {},
  })
}
