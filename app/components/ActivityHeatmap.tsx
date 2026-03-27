'use client';

import { useMemo, useState } from 'react';

interface ActivityDay {
  date: string; // YYYY-MM-DD
  hours: number;
  sessions: number;
}

interface Props {
  activity: ActivityDay[];
  memberSince: string;
}

function getIntensity(hours: number): number {
  if (hours === 0) return 0;
  if (hours < 0.5) return 1;
  if (hours < 1.5) return 2;
  if (hours < 3) return 3;
  return 4;
}

const INTENSITY_COLORS = [
  'bg-cream-200',        // 0: no activity
  'bg-orange-400/30',    // 1: light
  'bg-orange-400/55',    // 2: medium
  'bg-orange-500/80',    // 3: high
  'bg-orange-600',       // 4: max
];

const INTENSITY_BORDERS = [
  'border-cream-300',
  'border-orange-400/40',
  'border-orange-400/60',
  'border-orange-500/80',
  'border-orange-600',
];

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function ActivityHeatmap({ activity, memberSince }: Props) {
  const [tooltip, setTooltip] = useState<{ day: ActivityDay | null; x: number; y: number } | null>(null);

  const { weeks, monthLabels, stats } = useMemo(() => {
    const activityMap = new Map<string, ActivityDay>();
    for (const day of activity) {
      activityMap.set(day.date, day);
    }

    // Determine range: show last 16 weeks (compact, looks good even for new users)
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const totalWeeks = 16;
    const totalDays = totalWeeks * 7;

    // Start from the most recent Sunday
    const endDay = new Date(today);
    const dayOfWeek = endDay.getDay();
    // Go to next Saturday (end of current week) for a complete grid
    const daysUntilSat = (6 - dayOfWeek + 7) % 7;
    endDay.setDate(endDay.getDate() + daysUntilSat);

    const startDay = new Date(endDay);
    startDay.setDate(startDay.getDate() - totalDays + 1);

    // Build week columns
    const weeks: (ActivityDay & { future: boolean })[][] = [];
    const monthLabels: { label: string; colIndex: number }[] = [];
    let lastMonth = -1;
    let currentWeek: (ActivityDay & { future: boolean })[] = [];

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDay);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const isFuture = d > today;

      const existing = activityMap.get(dateStr);
      currentWeek.push({
        date: dateStr,
        hours: existing?.hours ?? 0,
        sessions: existing?.sessions ?? 0,
        future: isFuture,
      });

      // Month labels
      const month = d.getMonth();
      if (month !== lastMonth && d.getDay() === 0) {
        monthLabels.push({
          label: d.toLocaleDateString('en-US', { month: 'short' }),
          colIndex: weeks.length,
        });
        lastMonth = month;
      }

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) weeks.push(currentWeek);

    // Compute stats
    let totalHours = 0;
    let totalSessions = 0;
    let activeDays = 0;
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    // Walk all days chronologically for streak calculation
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDay);
      d.setDate(d.getDate() + i);
      if (d > today) break;
      const dateStr = d.toISOString().slice(0, 10);
      const day = activityMap.get(dateStr);
      if (day && day.sessions > 0) {
        totalHours += day.hours;
        totalSessions += day.sessions;
        activeDays++;
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    }
    currentStreak = tempStreak;

    return {
      weeks,
      monthLabels,
      stats: { totalHours, totalSessions, activeDays, currentStreak, longestStreak },
    };
  }, [activity]);

  return (
    <div className="bg-cream-100 border-2 border-cream-400 p-6">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-orange-500 text-2xl uppercase tracking-wide font-bold">Activity</h2>
        <div className="flex items-center gap-4 text-xs text-cream-600 uppercase tracking-wide">
          {stats.currentStreak > 0 && (
            <span>
              <span className="text-orange-500 font-bold text-sm">{stats.currentStreak}</span> day streak
            </span>
          )}
          {stats.longestStreak > 1 && stats.longestStreak !== stats.currentStreak && (
            <span>
              <span className="text-brown-800 font-bold text-sm">{stats.longestStreak}</span> best streak
            </span>
          )}
          <span>
            <span className="text-brown-800 font-bold text-sm">{Math.round(stats.totalHours * 10) / 10}</span> hrs
          </span>
        </div>
      </div>

      {/* Heatmap grid */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-0">
          {/* Month labels */}
          <div className="flex ml-8">
            {monthLabels.map((m, i) => {
              const nextCol = monthLabels[i + 1]?.colIndex ?? weeks.length;
              const span = nextCol - m.colIndex;
              return (
                <div
                  key={`${m.label}-${m.colIndex}`}
                  className="text-xs text-cream-600 uppercase tracking-wide"
                  style={{ width: `${span * 14}px` }}
                >
                  {m.label}
                </div>
              );
            })}
          </div>

          {/* Grid with day labels */}
          <div className="flex gap-0">
            {/* Day-of-week labels */}
            <div className="flex flex-col gap-[2px] mr-1 pt-[2px]">
              {DAY_LABELS.map((label, i) => (
                <div key={i} className="h-[12px] text-[9px] text-cream-600 uppercase tracking-wide leading-[12px] w-7 text-right pr-1">
                  {label}
                </div>
              ))}
            </div>

            {/* Weeks */}
            <div className="flex gap-[2px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[2px]">
                  {week.map((day) => {
                    const intensity = day.future ? -1 : getIntensity(day.hours);
                    return (
                      <div
                        key={day.date}
                        className={`w-[12px] h-[12px] border transition-colors duration-150 ${
                          day.future
                            ? 'bg-cream-100 border-cream-200'
                            : `${INTENSITY_COLORS[intensity]} ${INTENSITY_BORDERS[intensity]} hover:border-orange-500 cursor-default`
                        }`}
                        onMouseEnter={(e) => {
                          if (!day.future) {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltip({ day, x: rect.left + rect.width / 2, y: rect.top });
                          }
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-end gap-1 mt-2">
            <span className="text-[9px] text-cream-600 uppercase tracking-wide mr-1">Less</span>
            {INTENSITY_COLORS.map((color, i) => (
              <div key={i} className={`w-[10px] h-[10px] ${color} border ${INTENSITY_BORDERS[i]}`} />
            ))}
            <span className="text-[9px] text-cream-600 uppercase tracking-wide ml-1">More</span>
          </div>
        </div>
      </div>

      {/* Empty state encouragement */}
      {stats.totalSessions === 0 && (
        <p className="text-cream-500 text-xs uppercase tracking-wide mt-3 text-center">
          Log work sessions to fill up your heatmap!
        </p>
      )}

      {/* Tooltip */}
      {tooltip?.day && (
        <div
          className="fixed z-50 pointer-events-none bg-brown-800 text-cream-100 text-xs px-2 py-1 -translate-x-1/2 -translate-y-full"
          style={{ left: tooltip.x, top: tooltip.y - 6 }}
        >
          {tooltip.day.sessions > 0 ? (
            <>
              <span className="font-bold">{Math.round(tooltip.day.hours * 10) / 10}h</span>
              {' · '}
              {tooltip.day.sessions} session{tooltip.day.sessions !== 1 ? 's' : ''}
              {' · '}
            </>
          ) : (
            <span>No activity · </span>
          )}
          {formatDate(tooltip.day.date)}
        </div>
      )}
    </div>
  );
}
