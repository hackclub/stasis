'use client';

import { AttendanceCandidateSource, SOURCE_LABEL, SOURCE_FULL_LABEL, sourceBadgeClass } from '../lib/types';

/** Sentence-case badge identifying where a candidate came from. */
export function SourceBadge({ source, compact = false }: Readonly<{ source: AttendanceCandidateSource; compact?: boolean }>) {
  return (
    <span
      title={SOURCE_FULL_LABEL[source]}
      className={`inline-flex items-center ${compact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs'} font-medium ${sourceBadgeClass(source)}`}
    >
      {SOURCE_LABEL[source]}
    </span>
  );
}

/** Inline visual separator with proper horizontal breathing room. */
export function Dot() {
  return <span aria-hidden className="mx-2 text-cream-400/60 select-none">·</span>;
}
