'use client';

import { AttendanceStatus, statusBg, STATUS_LABEL } from '../lib/types';

export function StatusPill({ status, size = 'sm' }: Readonly<{ status: AttendanceStatus; size?: 'sm' | 'md' }>) {
  const cls = statusBg(status);
  const sizeCls = size === 'md' ? 'text-xs px-2.5 py-1' : 'text-xs px-2 py-0.5';
  return (
    <span className={`inline-flex items-center uppercase tracking-widest font-medium ${sizeCls} ${cls}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function FlagPill({
  label,
  tone = 'neutral',
  title,
}: Readonly<{ label: string; tone?: 'neutral' | 'positive' | 'caution' | 'snooze'; title?: string }>) {
  const cls =
    tone === 'positive' ? 'bg-green-500/20 text-green-400'
    : tone === 'caution' ? 'bg-orange-500/20 text-orange-300'
    : tone === 'snooze' ? 'bg-cream-200/10 text-cream-300 italic'
    : 'bg-cream-200/10 text-cream-200';
  return (
    <span title={title} className={`inline-flex items-center uppercase tracking-widest font-medium text-xs px-2 py-0.5 ${cls}`}>
      {label}
    </span>
  );
}
