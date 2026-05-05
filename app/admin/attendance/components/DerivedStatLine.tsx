'use client';

import { ReactNode } from 'react';
import { CandidateRow, earnedBits } from '../lib/types';
import { Tooltip } from './Tooltip';

const SEP = '\u2002\u00b7\u2002';

interface StatPart {
  key: string;
  text: string;
  tooltip: ReactNode;
  /** Adds a dotted underline so the admin-grant tooltip is discoverable. */
  flagged?: boolean;
}

export function DerivedStatLine({ row }: Readonly<{ row: CandidateRow }>) {
  const parts = buildParts(row);
  if (parts.length === 0) return <>—</>;
  return (
    <>
      {parts.map((p, i) => (
        <span key={p.key}>
          {i > 0 ? <span className="text-cream-400">{SEP}</span> : null}
          <Tooltip content={p.tooltip}>
            <span className={p.flagged ? 'underline decoration-dotted decoration-cream-500/60 underline-offset-[3px]' : undefined}>
              {p.text}
            </span>
          </Tooltip>
        </span>
      ))}
    </>
  );
}

function buildParts(row: CandidateRow): StatPart[] {
  const s = row.derivedStats;
  if (row.source === 'REVIEWER_INCENTIVE' && s.reviewerWeekCount != null) {
    return [{
      key: 'reviewer',
      text: `${s.reviewerWeekCount}/30 reviews`,
      tooltip: (
        <StatBlock title="Reviewer progress">
          <Row label="Done" value={`${s.reviewerWeekCount}`} />
          <Row label="Target" value="30" />
          <Row label="Window" value="since 5/5 11am EST" muted />
        </StatBlock>
      ),
    }];
  }

  const parts: StatPart[] = [];

  if (s.topProjectTier != null) {
    parts.push({
      key: 'tier',
      text: `T${s.topProjectTier}`,
      tooltip: (
        <StatBlock title="Top project tier">
          <Row label="Tier" value={`T${s.topProjectTier}`} />
          <Row label="Range" value="T1 – T5" muted />
          <Row label="Build award" value="25 – 400 bits" muted />
        </StatBlock>
      ),
    });
  }

  const earned = earnedBits(s);
  if (earned || s.adminGrantedDesignBits) {
    parts.push({
      key: 'bits',
      text: `${earned}b`,
      flagged: s.adminGrantedDesignBits > 0,
      tooltip: (
        <StatBlock title="Bits">
          <Row label="Earned" value={`${earned}`} />
          {s.adminGrantedDesignBits > 0 ? (
            <>
              <Row label="Admin grants" value={`+${s.adminGrantedDesignBits}`} muted />
              <Row label="Total" value={`${s.realBits}`} emphasis />
            </>
          ) : null}
          <Row label="Source" value="design + build approvals" muted />
        </StatBlock>
      ),
    });
  }

  if (s.totalHoursClaimed) {
    parts.push({
      key: 'hours',
      text: `${s.totalHoursClaimed.toFixed(0)}h`,
      tooltip: (
        <StatBlock title="Hours claimed">
          <Row label="Total" value={`${s.totalHoursClaimed.toFixed(1)}h`} />
          <Row label="Scope" value="all projects" muted />
          <Row label="Note" value="pre-deflation" muted />
        </StatBlock>
      ),
    });
  }

  if (s.projectsSubmitted) {
    parts.push({
      key: 'projects',
      text: `${s.projectsSubmitted}p`,
      tooltip: (
        <StatBlock title="Projects">
          <Row label="Submitted" value={`${s.projectsSubmitted}`} />
          <Row label="Approved" value={`${s.projectsApproved}`} />
        </StatBlock>
      ),
    });
  }

  return parts;
}

function StatBlock({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <div className="min-w-[160px]">
      <div className="text-[10px] uppercase tracking-widest text-cream-300 font-medium mb-1.5">{title}</div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function Row({ label, value, muted, emphasis }: Readonly<{ label: string; value: string; muted?: boolean; emphasis?: boolean }>) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] text-cream-400 font-medium">{label}</span>
      <span className={`text-xs tabular-nums ${emphasis ? 'text-cream-50 font-semibold' : muted ? 'text-cream-300' : 'text-cream-100 font-medium'}`}>{value}</span>
    </div>
  );
}
