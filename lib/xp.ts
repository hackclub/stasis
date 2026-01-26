const XP_PER_HOUR = 10

export function calculateJournalXP(dayStreak: number, weekStreak: number, hours: number = 1): { xp: number; multiplier: number } {
  const dayMultiplier = Math.min(dayStreak, 7) * 0.1
  const weekMultiplier = Math.min(weekStreak, 4) * 0.25
  const multiplier = 1 + dayMultiplier + weekMultiplier
  const baseXP = XP_PER_HOUR * hours
  
  return {
    xp: Math.round(baseXP * multiplier),
    multiplier: Math.round(multiplier * 100) / 100,
  }
}

export function getWeekNumber(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1)
  const diff = date.getTime() - startOfYear.getTime()
  const oneWeek = 1000 * 60 * 60 * 24 * 7
  return Math.floor(diff / oneWeek) + 1
}

export function isConsecutiveDay(lastDate: Date, currentDate: Date): boolean {
  const last = new Date(lastDate)
  last.setHours(0, 0, 0, 0)
  const current = new Date(currentDate)
  current.setHours(0, 0, 0, 0)
  
  const diffMs = current.getTime() - last.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  
  return diffDays === 1
}

export function isSameDay(date1: Date, date2: Date): boolean {
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  d1.setHours(0, 0, 0, 0)
  d2.setHours(0, 0, 0, 0)
  return d1.getTime() === d2.getTime()
}

export function getCurrentWeekBounds(): { weekStart: Date; weekEnd: Date } {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() + diffToMonday)
  weekStart.setHours(0, 0, 0, 0)
  
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)
  
  return { weekStart, weekEnd }
}

export function calculateMultiplier(dayStreak: number, weekStreak: number): number {
  const dayMultiplier = Math.min(dayStreak, 7) * 0.1
  const weekMultiplier = Math.min(weekStreak, 4) * 0.25
  return Math.round((1 + dayMultiplier + weekMultiplier) * 100) / 100
}
