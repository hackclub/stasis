'use client';

import { CandidateRow, derivedStatParts } from '../lib/types';
import { Tooltip } from './Tooltip';

const SEP = '\u2002\u00b7\u2002';

export function DerivedStatLine({ row }: Readonly<{ row: CandidateRow }>) {
  const parts = derivedStatParts(row);
  if (parts.length === 0) return <>—</>;
  return (
    <>
      {parts.map((p, i) => (
        <span key={p.key}>
          {i > 0 ? <span className="text-cream-400">{SEP}</span> : null}
          <Tooltip content={p.tooltip}>
            <span className={p.hasAdminGrantNote ? 'underline decoration-dotted decoration-cream-500/60 underline-offset-[3px]' : undefined}>
              {p.text}
            </span>
          </Tooltip>
        </span>
      ))}
    </>
  );
}
