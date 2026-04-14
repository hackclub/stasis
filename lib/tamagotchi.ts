// Tamagotchi Streak Challenge — event configuration and helpers

export const TAMAGOTCHI_EVENT = {
  START: '2026-03-27',
  END: '2026-04-13',
  STREAK_GOAL: 7,
  TOTAL_DAYS: 18,
  // Show UI for 7 days after event ends so winners can see completion state
  GRACE_DAYS: 7,
  // Sessions created within this many minutes after midnight count for the previous day
  GRACE_MINUTES: 30,
} as const;

export interface TamagotchiDay {
  date: string;        // YYYY-MM-DD
  completed: boolean;  // has journal entry
  hasJournal: boolean;
  sessions: number;
  isToday: boolean;
  isFuture: boolean;
  isGraceDay: boolean; // admin-granted grace day (bridges streak without counting)
}

export interface TamagotchiStatus {
  eventActive: boolean;
  eventVisible: boolean;

  // The "window" = today through min(today+6, eventEnd)
  windowDays: TamagotchiDay[];
  // Event days before today (for left-side extra squares)
  pastDays: TamagotchiDay[];
  // Event days after window end (for right-side extra squares)
  futureDays: TamagotchiDay[];

  currentStreak: number;
  bestStreak: number;
  challengeComplete: boolean;
  // Can the user still hit 7 consecutive days before event ends?
  canStillComplete: boolean;

  todayProgress: {
    hasJournal: boolean;
    complete: boolean;
  };

  reward: {
    completedAt: string;
    claimed: boolean;
    shipped: boolean;
  } | null;
  recentProjectId: string | null;
  graceDays: { date: string }[];
}

// ---- Timezone helpers ----

/** Get YYYY-MM-DD string for a Date in a given IANA timezone */
export function getLocalDateStr(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Get the "effective date" for a work session, applying the grace period.
 * Sessions created within GRACE_MINUTES after midnight count for the previous day.
 */
export function getEffectiveDate(sessionCreatedAt: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(sessionCreatedAt);

  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '12', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);

  // Within grace period after midnight? Count for previous day.
  if (hour === 0 && minute < TAMAGOTCHI_EVENT.GRACE_MINUTES) {
    const shifted = new Date(sessionCreatedAt.getTime() - TAMAGOTCHI_EVENT.GRACE_MINUTES * 60 * 1000);
    return getLocalDateStr(shifted, tz);
  }

  return getLocalDateStr(sessionCreatedAt, tz);
}

/** Validate an IANA timezone string. Returns the string if valid, fallback otherwise. */
export function validateTimezone(tz: string | null | undefined): string {
  if (!tz) return 'America/New_York';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return 'America/New_York';
  }
}

// ---- Event date helpers ----

/** Get all 14 event day date strings (YYYY-MM-DD) */
export function getEventDayDates(): string[] {
  const dates: string[] = [];
  const start = new Date(TAMAGOTCHI_EVENT.START + 'T00:00:00Z');
  for (let i = 0; i < TAMAGOTCHI_EVENT.TOTAL_DAYS; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/** Get the window dates: 7 non-grace dates starting from streakStart, skipping grace days */
export function getWindowDates(streakStart: string, graceDayDates?: Set<string>): string[] {
  const dates: string[] = [];
  const start = new Date(streakStart + 'T12:00:00Z');
  const graceSet = graceDayDates ?? new Set<string>();
  const maxCalendarDays = TAMAGOTCHI_EVENT.STREAK_GOAL + graceSet.size + 1;

  for (let i = 0; i < maxCalendarDays; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    if (dateStr > TAMAGOTCHI_EVENT.END) break;
    if (dateStr < TAMAGOTCHI_EVENT.START) continue;
    if (graceSet.has(dateStr)) continue;
    dates.push(dateStr);
    if (dates.length >= TAMAGOTCHI_EVENT.STREAK_GOAL) break;
  }
  return dates;
}

/**
 * Find the start date of the current streak attempt.
 * Walks backwards from today through consecutive completed or grace days.
 * If no streak, returns today (fresh attempt).
 */
export function findStreakStart(days: TamagotchiDay[], today: string): string {
  const todayIdx = days.findIndex(d => d.date === today);
  if (todayIdx < 0) return today;

  // Start from today if it's complete/grace, or yesterday if not
  let idx = todayIdx;
  if (!days[idx].completed && !days[idx].isGraceDay && idx > 0) {
    idx = todayIdx - 1;
  }

  // If this day isn't complete or grace, no active streak — fresh start from today
  if (!days[idx].completed && !days[idx].isGraceDay) return today;

  // Walk backwards through consecutive completed or grace days
  while (idx > 0 && (days[idx - 1].completed || days[idx - 1].isGraceDay)) {
    idx--;
  }

  // Skip past any leading grace days to land on first real completed day
  while (idx < todayIdx && days[idx].isGraceDay) {
    idx++;
  }

  if (!days[idx].completed && !days[idx].isGraceDay) return today;

  return days[idx].date;
}

/** Is today within the event window? */
export function isEventActive(today?: string): boolean {
  const t = today ?? new Date().toISOString().slice(0, 10);
  return t >= TAMAGOTCHI_EVENT.START && t <= TAMAGOTCHI_EVENT.END;
}

/** Should the Tamagotchi UI be visible? (active + grace period) */
export function isEventVisible(today?: string): boolean {
  const t = today ?? new Date().toISOString().slice(0, 10);
  const graceEnd = new Date(TAMAGOTCHI_EVENT.END + 'T00:00:00Z');
  graceEnd.setUTCDate(graceEnd.getUTCDate() + TAMAGOTCHI_EVENT.GRACE_DAYS);
  const graceEndStr = graceEnd.toISOString().slice(0, 10);
  return t >= TAMAGOTCHI_EVENT.START && t <= graceEndStr;
}

/** Can the user still complete a 7-day streak before the event ends, given their current streak? */
export function canStillComplete(today: string, currentStreak: number = 0): boolean {
  const todayDate = new Date(today + 'T12:00:00Z');
  const endDate = new Date(TAMAGOTCHI_EVENT.END + 'T12:00:00Z');
  const daysRemaining = Math.floor((endDate.getTime() - todayDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const daysNeeded = Math.max(0, TAMAGOTCHI_EVENT.STREAK_GOAL - currentStreak);
  return daysRemaining >= daysNeeded;
}

// ---- Streak computation ----

/**
 * Compute streak data from the full event days array.
 * A day is "completed" if hasJournal is true.
 * Grace days bridge the streak without counting toward the goal.
 */
export function computeStreaks(
  days: TamagotchiDay[],
): { currentStreak: number; bestStreak: number; challengeComplete: boolean } {
  let currentStreak = 0;
  let bestStreak = 0;
  let tempStreak = 0;
  let challengeComplete = false;

  for (const day of days) {
    if (day.isFuture) break;
    if (day.completed) {
      tempStreak++;
      if (tempStreak >= TAMAGOTCHI_EVENT.STREAK_GOAL) {
        challengeComplete = true;
      }
      bestStreak = Math.max(bestStreak, tempStreak);
    } else if (day.isGraceDay) {
      // Grace day: don't break streak, don't count toward goal
    } else {
      tempStreak = 0;
    }
  }

  currentStreak = tempStreak;

  return { currentStreak, bestStreak, challengeComplete };
}
