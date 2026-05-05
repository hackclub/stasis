'use client';

import { AttendanceStatus, statusBg, STATUS_LABEL } from '../lib/types';

export function StatusPill({ status, size = 'sm' }: Readonly<{ status: AttendanceStatus; size?: 'sm' | 'md' }>) {
  const cls = statusBg(status);
  const sizeCls = size === 'md' ? 'text-xs px-2.5 py-1' : 'text-[10px] px-2 py-0.5';
  return (
    <span className={`inline-flex items-center uppercase tracking-wider border ${sizeCls} ${cls}`}>
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
    tone === 'positive' ? 'bg-green-500/10 border-green-500/40 text-green-500'
    : tone === 'caution' ? 'bg-orange-500/10 border-orange-500/40 text-orange-400'
    : tone === 'snooze' ? 'bg-cream-50/5 border-cream-300/30 text-cream-400 italic'
    : 'bg-cream-50/5 border-cream-200/30 text-cream-200';
  return (
    <span title={title} className={`inline-flex items-center uppercase tracking-wider text-[10px] px-2 py-0.5 border ${cls}`}>
      {label}
    </span>
  );
}
