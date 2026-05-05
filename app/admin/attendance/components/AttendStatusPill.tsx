'use client';

import { Tooltip } from './Tooltip';
import {
  AttendDisplayState,
  ATTEND_DISPLAY_LABEL,
  attendDisplayTone,
  attendStatusTooltip,
} from '../lib/types';

/**
 * Coarse 3-state badge for a candidate's Attend lifecycle.
 *
 * - state: derived bucket (invited / wip / complete). Renders nothing when null.
 * - rawStatus: the underlying participant_events.status from Attend (or the
 *   synthetic 'invited' for the pending-invitation case). Echoed in the
 *   tooltip so admins can see the precise sub-state without leaving the page.
 */
export function AttendStatusPill({
  state,
  rawStatus,
  size = 'sm',
}: Readonly<{
  state: AttendDisplayState;
  rawStatus?: string | null;
  size?: 'sm' | 'md';
}>) {
  if (!state) return null;
  const sizing = size === 'md' ? 'text-xs px-2 py-0.5' : 'text-[10px] px-1.5 py-0.5';
  return (
    <Tooltip content={attendStatusTooltip(state, rawStatus)}>
      <span
        className={`inline-flex items-center font-medium uppercase tracking-wider ${attendDisplayTone(state)} ${sizing}`}
      >
        {ATTEND_DISPLAY_LABEL[state]}
      </span>
    </Tooltip>
  );
}
