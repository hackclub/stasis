'use client';

import { useState, useEffect } from 'react';

interface RentalTimerProps {
  dueAt: string | null;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

export function RentalTimer({ dueAt }: RentalTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!dueAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [dueAt]);

  if (!dueAt) {
    return <span className="text-brown-800/60 text-sm">No time limit</span>;
  }

  const due = new Date(dueAt).getTime();
  const diff = due - now;
  const overdue = diff <= 0;

  return (
    <span className={`text-sm font-bold ${overdue ? 'text-red-600' : 'text-brown-800'}`}>
      {overdue ? 'Overdue' : formatDuration(diff)}
    </span>
  );
}
