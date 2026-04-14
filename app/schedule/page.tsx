'use client';

import { Suspense, useState, useEffect, Fragment } from 'react';
import Link from 'next/link';
import { NoiseOverlay } from '../components/NoiseOverlay';
import { HoverScramble } from '../components/HoverScramble';
import { DottedLine } from '../components/DottedLine';

// --- Types ---

type EventCategory = 'meal' | 'interactive' | 'social' | 'logistics' | 'ambient';

interface ScheduleEvent {
  name: string;
  category: EventCategory;
  startHour: number;
  startMinute: number;
  durationMinutes: number;
}

interface Deadline {
  name: string;
  hour: number;
  minute: number;
}

interface ScheduleDay {
  label: string;
  date: string;
  isoDate: string;
  gridStartHour: number;
  gridEndHour: number;
  events: ScheduleEvent[];
  deadlines: Deadline[];
}

// --- Constants ---

const SLOT_PX = 28;

const CATEGORY_COLORS: Record<EventCategory, { border: string; text: string }> = {
  meal: { border: '#E1AB55', text: '#6B5230' },
  interactive: { border: '#D95D39', text: '#7A3320' },
  social: { border: '#C9856B', text: '#6B4536' },
  logistics: { border: '#C4BDB4', text: '#A09889' },
  ambient: { border: '#C4BDB4', text: '#A09889' },
};

const SCHEDULE: ScheduleDay[] = [
  {
    label: 'FRIDAY',
    date: 'MAY 15',
    isoDate: '2026-05-15',
    gridStartHour: 15,
    gridEndHour: 22,
    events: [
      { name: 'Doors Open & Hanging Out', category: 'ambient', startHour: 15, startMinute: 0, durationMinutes: 240 },
      { name: 'Opening Ceremony', category: 'logistics', startHour: 19, startMinute: 0, durationMinutes: 60 },
      { name: 'Dinner', category: 'meal', startHour: 20, startMinute: 0, durationMinutes: 60 },
      { name: 'Ideas Demo', category: 'interactive', startHour: 21, startMinute: 0, durationMinutes: 60 },
    ],
    deadlines: [],
  },
  {
    label: 'SATURDAY',
    date: 'MAY 16',
    isoDate: '2026-05-16',
    gridStartHour: 8,
    gridEndHour: 25,
    events: [
      { name: 'Breakfast', category: 'meal', startHour: 8, startMinute: 0, durationMinutes: 60 },
      { name: 'Workshop', category: 'interactive', startHour: 10, startMinute: 0, durationMinutes: 60 },
      { name: 'Project Demo', category: 'interactive', startHour: 12, startMinute: 0, durationMinutes: 60 },
      { name: 'Lunch & Walk to Downtown Austin', category: 'meal', startHour: 13, startMinute: 0, durationMinutes: 180 },
      { name: 'Workshop', category: 'interactive', startHour: 17, startMinute: 30, durationMinutes: 60 },
      { name: 'Dinner & Lightning Talks', category: 'meal', startHour: 19, startMinute: 0, durationMinutes: 60 },
      { name: 'Just Dance', category: 'social', startHour: 20, startMinute: 0, durationMinutes: 60 },
      { name: 'Midnight Surprise', category: 'social', startHour: 24, startMinute: 1, durationMinutes: 30 },
    ],
    deadlines: [],
  },
  {
    label: 'SUNDAY',
    date: 'MAY 17',
    isoDate: '2026-05-17',
    gridStartHour: 8,
    gridEndHour: 25,
    events: [
      { name: 'Breakfast', category: 'meal', startHour: 8, startMinute: 0, durationMinutes: 60 },
      { name: 'Workshop', category: 'interactive', startHour: 10, startMinute: 0, durationMinutes: 60 },
      { name: 'Lunch', category: 'meal', startHour: 13, startMinute: 0, durationMinutes: 60 },
      { name: 'Project Demo', category: 'interactive', startHour: 16, startMinute: 0, durationMinutes: 60 },
      { name: 'Dinner & Lightning Talks', category: 'meal', startHour: 19, startMinute: 0, durationMinutes: 60 },
      { name: 'Karaoke', category: 'social', startHour: 20, startMinute: 30, durationMinutes: 30 },
      { name: 'Midnight Surprise', category: 'social', startHour: 24, startMinute: 1, durationMinutes: 30 },
    ],
    deadlines: [],
  },
  {
    label: 'MONDAY',
    date: 'MAY 18',
    isoDate: '2026-05-18',
    gridStartHour: 8,
    gridEndHour: 14,
    events: [
      { name: 'Breakfast', category: 'meal', startHour: 8, startMinute: 30, durationMinutes: 60 },
      { name: 'Project Expo & Demos', category: 'interactive', startHour: 9, startMinute: 30, durationMinutes: 90 },
      { name: 'Closing Ceremony', category: 'logistics', startHour: 11, startMinute: 0, durationMinutes: 60 },
      { name: 'Pack Up', category: 'logistics', startHour: 12, startMinute: 0, durationMinutes: 60 },
    ],
    deadlines: [
      { name: 'Project Submission Deadline', hour: 8, minute: 0 },
      { name: 'Venue Closes', hour: 13, minute: 30 },
    ],
  },
];

const EVENT_START = new Date('2026-05-15T15:00:00-05:00');
const EVENT_END = new Date('2026-05-18T13:00:00-05:00');

// --- Helpers ---

function formatHour(hour: number): string {
  const h = hour % 24;
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function formatTime(hour: number, minute: number): string {
  const hr = hour % 24;
  const h = hr % 12 || 12;
  const suffix = hr < 12 ? 'AM' : 'PM';
  return minute === 0 ? `${h} ${suffix}` : `${h}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function toCT(date: Date) {
  const ct = new Date(date.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  return {
    hour: ct.getHours(),
    minute: ct.getMinutes(),
    dateStr: date.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }),
  };
}

// --- Day Grid ---

function DayGrid({
  day,
  now,
  live,
}: Readonly<{
  day: ScheduleDay;
  now: Date;
  live: boolean;
}>) {
  const numSlots = (day.gridEndHour - day.gridStartHour) * 2;
  const gridStartMin = day.gridStartHour * 60;
  const hours = Array.from({ length: day.gridEndHour - day.gridStartHour + 1 }, (_, i) => day.gridStartHour + i);

  const ct = toCT(now);
  const isToday = live && ct.dateStr === day.isoDate;
  const nowMinutes = ct.hour * 60 + ct.minute;
  const nowTop = ((nowMinutes - gridStartMin) / 30) * SLOT_PX;
  const showNow = isToday && nowTop >= 0 && nowTop <= numSlots * SLOT_PX;

  return (
    <div className="relative" style={{ height: numSlots * SLOT_PX + 1 }}>
      {/* Hour labels — outside content on desktop */}
      {hours.map(hour => (
        <span
          key={`l-${hour}`}
          className="absolute left-0 md:-left-[58px] w-[42px] md:w-[50px] text-right -translate-y-[9px] text-xs text-brown-800 select-none"
          style={{ top: ((hour - day.gridStartHour) * 2) * SLOT_PX }}
        >
          {formatHour(hour)}
        </span>
      ))}

      {/* Hour grid lines */}
      {hours.map(hour => (
        <div
          key={`g-${hour}`}
          className="absolute left-[54px] md:left-0 right-0 border-t border-cream-300"
          style={{ top: ((hour - day.gridStartHour) * 2) * SLOT_PX }}
        />
      ))}

      {/* Event blocks */}
      {day.events.map(event => {
        const startMin = event.startHour * 60 + event.startMinute;
        const top = ((startMin - gridStartMin) / 30) * SLOT_PX;
        const height = (event.durationMinutes / 30) * SLOT_PX;
        const endMin = startMin + event.durationMinutes;
        const endHour = Math.floor(endMin / 60);
        const endMinute = endMin % 60;
        const isPast = isToday && nowMinutes >= endMin;
        const isCurrent = isToday && nowMinutes >= startMin && nowMinutes < endMin;
        const showTime = event.durationMinutes > 30;
        return (
          <div
            key={`${event.name}-${event.startHour}-${event.startMinute}`}
            className={`absolute left-[54px] md:left-4 right-4 z-[1] transition-opacity ${isPast ? 'opacity-40' : ''}`}
            style={{ top, height }}
          >
            <div
              className={`h-full bg-cream-100 border-l-[3px] border-t-[3px] px-2 overflow-hidden flex flex-col justify-center relative ${
                isCurrent ? 'ring-1 ring-orange-500' : ''
              }`}
              style={{
                borderLeftColor: CATEGORY_COLORS[event.category].border,
                borderTopColor: CATEGORY_COLORS[event.category].border,
                clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)',
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: `linear-gradient(to bottom, ${CATEGORY_COLORS[event.category].border}14, transparent)` }}
              />
              <span className="text-xs font-medium leading-tight relative" style={{ color: CATEGORY_COLORS[event.category].text }}>{event.name}</span>
              {showTime && (
                <span className="text-xs mt-0.5 relative" style={{ color: CATEGORY_COLORS[event.category].text }}>
                  {formatTime(event.startHour, event.startMinute)} – {formatTime(endHour, endMinute)}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Deadline markers */}
      {day.deadlines.map(dl => {
        const top = ((dl.hour * 60 + dl.minute - gridStartMin) / 30) * SLOT_PX;
        return (
          <div
            key={dl.name}
            className="absolute left-[54px] md:left-0 right-0 flex items-center z-10 -translate-y-1/2"
            style={{ top }}
          >
            <div className="flex-1 border-t-2 border-dashed border-orange-500" />
            <span className="text-xs text-orange-500 uppercase tracking-wider pl-2 pr-1 py-0.5 whitespace-nowrap font-medium bg-cream-100 border border-orange-500">
              {dl.name}
            </span>
          </div>
        );
      })}

      {/* Now line */}
      {showNow && (
        <div
          className="absolute left-[50px] md:-left-1 right-0 flex items-center z-20 pointer-events-none"
          style={{ top: nowTop }}
        >
          <div
            className="w-2 h-2 rounded-full bg-orange-500 shrink-0"
            style={{ animation: 'pulse-dot 2s ease-in-out infinite' }}
          />
          <div className="flex-1 border-t-2 border-orange-500" />
        </div>
      )}
    </div>
  );
}

// --- Page ---

function ScheduleContent() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const live = now >= EVENT_START && now <= EVENT_END;

  return (
    <div className="bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono text-brown-800 bg-container overflow-x-hidden">
      <style jsx>{`
        .bg-container::before {
          content: '';
          position: fixed;
          inset: 0;
          background: linear-gradient(#DAD2BF99, #DAD2BF99), url(/noise-smooth.png);
          pointer-events: none;
          z-index: -1;
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.4; }
        }
      `}</style>

      <div className="min-h-screen relative z-0">
        <div className="mx-auto max-w-3xl pt-14 pb-16 md:pt-20 md:pb-24 px-5 md:px-10">

          {/* Header */}
          <header className="text-center mb-8 md:mb-12">
            <Link href="/" aria-label="Stasis home" className="inline-block mb-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/stasis-logo-center.svg"
                alt="Stasis"
                className="h-16 md:h-24 w-auto mx-auto select-none"
              />
            </Link>
            <div className="relative mx-auto max-w-[460px] flex items-center justify-center mb-3">
              <div className="absolute left-0 top-1/2 h-px w-[14%] bg-[#d95d39]" />
              <div className="absolute right-0 top-1/2 h-px w-[14%] bg-[#d95d39]" />
              <span className="absolute left-[14%] top-1/2 -translate-y-1/2 w-2 h-2 border-l-[3px] border-t-[3px] border-[#d95d39]" />
              <span className="absolute right-[14%] top-1/2 -translate-y-1/2 w-2 h-2 border-r-[3px] border-b-[3px] border-[#d95d39]" />
              <h1 className="text-[24px] uppercase tracking-wider text-[#d95d39] px-4 m-0">
                Schedule
              </h1>
            </div>
            <p className="text-xs text-brown-800 uppercase tracking-widest mb-4">
              May 15–18, 2026 <span className="opacity-40 text-[0.5em] inline-block translate-y-[-0.25em]">■</span> Austin, TX <span className="opacity-40 text-[0.5em] inline-block translate-y-[-0.25em]">■</span> All times CT
            </p>

          </header>

          {/* Separator */}
          <div className="relative h-px mb-8 md:mb-12">
            <DottedLine orientation="horizontal" />
          </div>

          {/* Continuous calendar */}
          <div>
            {SCHEDULE.map((day, i) => (
              <Fragment key={day.isoDate}>
                {/* Overnight marker between days */}
                {i > 0 && (
                  <div className="py-12 md:py-16 flex items-center gap-3 ml-[54px] md:ml-0 px-8 md:px-16">
                    <div className="flex-1 border-t border-cream-400" />
                    <span className="text-xs text-brown-800 uppercase tracking-wider">Quiet Hours</span>
                    <div className="flex-1 border-t border-cream-400" />
                  </div>
                )}

                {/* Day header — orange tab */}
                <div className="ml-[54px] md:ml-0 mb-2">
                  <div className="bg-orange-500 text-brown-900 px-3 py-1.5 text-xs uppercase tracking-wider font-medium inline-block">
                    <HoverScramble
                      segments={[{ text: `${day.label}, ${day.date}` }]}
                      srLabel={`${day.label}, ${day.date}`}
                    />
                  </div>
                </div>

                {/* Day grid */}
                <DayGrid day={day} now={now} live={live} />
              </Fragment>
            ))}
          </div>

          {/* Footer note */}
          <p className="text-center text-xs text-brown-800 uppercase tracking-wider mt-10">
            Schedule is approximate and subject to change
          </p>
        </div>
      </div>

      <NoiseOverlay />
    </div>
  );
}

export default function SchedulePage() {
  return (
    <Suspense>
      <ScheduleContent />
    </Suspense>
  );
}
