'use client';

import { useState, useEffect } from 'react';

export interface ShopStatus {
  closed: boolean;
  // ISO timestamp the shop closes for everyone not still in review.
  closesAt: string | null;
  // Server-rendered Eastern-time date label for closesAt.
  closesAtLabel: string | null;
  // True when the user has work in the review queue, which keeps the shop open
  // for them past the close date.
  pendingReview: boolean;
  // End of the user's post-review window, if still in the future. Set before
  // the close date too, so "closing soon" copy can account for it.
  graceUntil: string | null;
  graceUntilLabel: string | null;
  reason: 'OPEN' | 'PENDING_REVIEW' | 'GRACE_PERIOD' | 'CLOSED' | null;
  graceDays: number;
  message: string | null;
  loading: boolean;
}

const INITIAL: ShopStatus = {
  closed: false,
  closesAt: null,
  closesAtLabel: null,
  pendingReview: false,
  graceUntil: null,
  graceUntilLabel: null,
  reason: null,
  graceDays: 7,
  message: null,
  loading: true,
};

export function useShopStatus(enabled = true): ShopStatus {
  const [status, setStatus] = useState<ShopStatus>(INITIAL);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch('/api/shop/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setStatus(
          data
            ? {
                closed: Boolean(data.closed),
                closesAt: data.closesAt ?? null,
                closesAtLabel: data.closesAtLabel ?? null,
                pendingReview: Boolean(data.pendingReview),
                graceUntil: data.graceUntil ?? null,
                graceUntilLabel: data.graceUntilLabel ?? null,
                reason: data.reason ?? null,
                graceDays: data.graceDays ?? 7,
                message: data.message ?? null,
                loading: false,
              }
            : { ...INITIAL, loading: false }
        );
      })
      .catch(() => {
        if (!cancelled) setStatus({ ...INITIAL, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return status;
}
