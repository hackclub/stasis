'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useInventorySSE } from '@/lib/inventory/useInventorySSE';
import {
  StatusBadge,
  minutesToHuman,
  statusLabel,
  submittedTime,
  type ManufacturingJob,
  type ManufacturingState,
} from '@/app/components/inventory/manufacturing/ManufacturingUI';

interface OrderItem {
  id: string;
  item: { id: string; name: string };
  quantity: number;
}

interface Order {
  id: string;
  team: { id: string; name: string };
  placedBy: { id: string; name: string; email?: string };
  floor: number;
  location: string;
  status: 'PLACED' | 'IN_PROGRESS' | 'READY' | 'COMPLETED' | 'CANCELLED';
  items: OrderItem[];
  createdAt: string;
}

interface Rental {
  id: string;
  tool: { id: string; name: string };
  team: { id: string; name: string };
  rentedBy: { id: string; name: string; email?: string };
  status: 'PLACED' | 'IN_PROGRESS' | 'READY' | 'CHECKED_OUT' | 'RETURN_REQUESTED' | 'RETURNED' | 'CANCELLED';
  floor: number;
  location: string;
  createdAt: string;
  returnRequestedAt?: string | null;
  dueAt?: string;
}

interface LookupResult {
  user: {
    id: string;
    name: string;
    email?: string;
    slackId?: string;
    slackDisplayName?: string;
    nfcId?: string;
    image?: string;
  };
  team?: { name: string };
  activeOrder?: Order;
  activeRentals?: { id: string; tool: { name: string }; createdAt: string }[];
}

interface LookupSuggestion {
  id: string;
  name: string;
  slackDisplayName?: string | null;
  image?: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  PLACED: 'bg-cream-200 text-brown-800 border-brown-800',
  IN_PROGRESS: 'bg-orange-400 text-cream-50 border-orange-500',
  READY: 'bg-orange-500 text-cream-50 border-orange-600',
  CHECKED_OUT: 'bg-brown-800 text-cream-50 border-brown-900',
  RETURN_REQUESTED: 'bg-orange-100 text-orange-800 border-orange-700',
  COMPLETED: 'bg-brown-800 text-cream-50 border-brown-900',
  RETURNED: 'bg-brown-800 text-cream-50 border-brown-900',
  CANCELLED: 'bg-cream-200 text-brown-800/50 border-brown-800/30',
};

export default function AdminActivityPage() {
  // Orders
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  // Rentals
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [rentalsLoading, setRentalsLoading] = useState(true);
  const [returning, setReturning] = useState<string | null>(null);

  // Manufacturing
  const [manufacturing, setManufacturing] = useState<ManufacturingState | null>(null);
  const [manufacturingLoading, setManufacturingLoading] = useState(true);
  const [manufacturingUpdating, setManufacturingUpdating] = useState<string | null>(null);
  const [manufacturingError, setManufacturingError] = useState<string | null>(null);

  // Lookup
  const [lookupInput, setLookupInput] = useState('');
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupFocused, setLookupFocused] = useState(false);
  const [lookupSuggestions, setLookupSuggestions] = useState<LookupSuggestion[]>([]);
  const [lookupSuggestLoading, setLookupSuggestLoading] = useState(false);

  // Badge
  const [assigningBadge, setAssigningBadge] = useState(false);
  const [badgeInput, setBadgeInput] = useState('');
  const [badgeAssigning, setBadgeAssigning] = useState(false);
  const [badgeError, setBadgeError] = useState<string | null>(null);
  const [badgeSuccess, setBadgeSuccess] = useState<string | null>(null);
  const badgeInputRef = useRef<HTMLInputElement>(null);

  const hidBuffer = useRef('');
  const hidTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookupInputRef = useRef<HTMLInputElement>(null);
  const lookupBlurTimer = useRef<number | null>(null);

  const sseEvent = useInventorySSE('admin');

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/admin/orders');
      if (res.ok) setOrders(await res.json());
    } catch (error) {
      console.error('Failed to load admin orders', error);
      setManufacturingError('Failed to load admin orders.');
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const fetchRentals = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/admin/rentals');
      if (res.ok) setRentals(await res.json());
    } catch (error) {
      console.error('Failed to load admin rentals', error);
      setManufacturingError('Failed to load admin rentals.');
    } finally {
      setRentalsLoading(false);
    }
  }, []);

  const fetchManufacturing = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/manufacturing/state');
      if (res.ok) {
        const data = await res.json();
        setManufacturing(data);
      }
    } catch {
      setManufacturingError('Failed to load manufacturing jobs.');
    } finally {
      setManufacturingLoading(false);
    }
  }, []);

  useEffect(() => { setOrdersLoading(true); fetchOrders(); }, [fetchOrders]);
  useEffect(() => { fetchRentals(); }, [fetchRentals]);
  useEffect(() => { fetchManufacturing(); }, [fetchManufacturing]);
  useEffect(() => {
    if (!sseEvent) return;
    const type = sseEvent.type;
    if (type === 'order_placed' || type === 'order_status_updated') fetchOrders();
    if (type === 'rental_created' || type === 'rental_returned' || type === 'rental_status_updated') fetchRentals();
    if (type === 'manufacturing_job_created' || type === 'manufacturing_job_updated') fetchManufacturing();
  }, [sseEvent, fetchOrders, fetchRentals, fetchManufacturing]);

  useEffect(() => {
    const query = lookupInput.trim();
    if (!lookupFocused || assigningBadge || query.length < 3) {
      setLookupSuggestions([]);
      setLookupSuggestLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLookupSuggestLoading(true);
      try {
        const res = await fetch(`/api/inventory/lookup?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        setLookupSuggestions(data.results ?? []);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setLookupSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) setLookupSuggestLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [lookupInput, lookupFocused, assigningBadge]);

  useEffect(() => {
    return () => {
      if (lookupBlurTimer.current) window.clearTimeout(lookupBlurTimer.current);
    };
  }, []);

  const updateStatus = async (orderId: string, newStatus: string) => {
    setUpdating(orderId);
    try {
      const res = await fetch(`/api/inventory/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) await fetchOrders();
    } catch (error) {
      console.error('Failed to update order status', error);
      setManufacturingError('Failed to update order status.');
    } finally { setUpdating(null); }
  };

  const updateRentalStatus = async (rental: Rental, status: Rental['status']) => {
    setReturning(rental.id);
    try {
      const res = await fetch(`/api/inventory/admin/rentals/${rental.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) await fetchRentals();
    } catch (error) {
      console.error('Failed to update rental status', error);
      setManufacturingError('Failed to update rental status.');
    } finally { setReturning(null); }
  };

  const updateManufacturingJob = async (job: ManufacturingJob, patch: Record<string, unknown>) => {
    setManufacturingUpdating(job.id);
    setManufacturingError(null);
    try {
      const res = await fetch(`/api/inventory/admin/manufacturing/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setManufacturingError(data?.error || 'Failed to update manufacturing job.');
        return;
      }
      await fetchManufacturing();
    } catch {
      setManufacturingError('Failed to update manufacturing job.');
    } finally {
      setManufacturingUpdating(null);
    }
  };

  // HID NFC
  const handleHidInput = useCallback((e: KeyboardEvent) => {
    const active = document.activeElement;
    const isLookupFocused = active === lookupInputRef.current;
    const isBadgeFocused = active === badgeInputRef.current;
    const noInputFocused = active === document.body || active === null;
    if (!isLookupFocused && !isBadgeFocused && !noInputFocused) return;
    if (e.key.length !== 1 && e.key !== 'Enter') return;

    if (e.key === 'Enter') {
      if (hidBuffer.current.length >= 6) {
        e.preventDefault();
        const value = hidBuffer.current;
        hidBuffer.current = '';
        if (hidTimer.current) clearTimeout(hidTimer.current);
        if (isBadgeFocused || assigningBadge) {
          setBadgeInput(value);
        } else {
          setLookupInput(value);
          handleLookup(value);
        }
      }
      hidBuffer.current = '';
      return;
    }

    if (hidTimer.current) clearTimeout(hidTimer.current);
    hidBuffer.current += e.key;
    hidTimer.current = setTimeout(() => { hidBuffer.current = ''; }, 80);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assigningBadge]);

  useEffect(() => {
    document.addEventListener('keydown', handleHidInput);
    return () => document.removeEventListener('keydown', handleHidInput);
  }, [handleHidInput]);

  const handleLookup = async (slackId?: string) => {
    const id = slackId || lookupInput.trim();
    if (!id) return;
    setLookupLoading(true); setLookupError(null); setLookupResult(null); setLookupSuggestions([]); setLookupFocused(false);
    try {
      const res = await fetch(`/api/inventory/lookup/${encodeURIComponent(id)}`);
      if (!res.ok) { setLookupError('User not found. Try selecting a Stasis account from the autocomplete.'); return; }
      setLookupResult(await res.json());
    } catch { setLookupError('Lookup failed.'); } finally { setLookupLoading(false); }
  };

  const selectLookupSuggestion = (suggestion: LookupSuggestion) => {
    setLookupInput(suggestion.name);
    setLookupSuggestions([]);
    setLookupFocused(false);
    handleLookup(suggestion.id);
  };

  const handleNFCScan = async () => {
    try {
      if (!('NDEFReader' in window)) { setLookupError('NFC not supported on this device.'); return; }
      // @ts-expect-error NDEFReader is not in all TS libs
      const ndef = new NDEFReader();
      await ndef.scan();
      ndef.addEventListener('reading', ({ message }: { message: { records: Array<{ recordType: string; data: ArrayBuffer }> } }) => {
        for (const record of message.records) {
          if (record.recordType === 'text') {
            handleLookup(new TextDecoder().decode(record.data));
            return;
          }
        }
        setLookupError('No Slack ID found on badge.');
      });
    } catch { setLookupError('NFC scan failed or was cancelled.'); }
  };

  const handleAssignBadge = async () => {
    if (!lookupResult || !badgeInput.trim()) return;
    setBadgeAssigning(true); setBadgeError(null); setBadgeSuccess(null);
    try {
      const res = await fetch('/api/inventory/admin/assign-badge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: lookupResult.user.id, nfcId: badgeInput.trim() }),
      });
      if (!res.ok) { const err = await res.json().catch(() => null); setBadgeError(err?.error || 'Failed to assign badge.'); return; }
      setBadgeSuccess(`Badge ${badgeInput.trim()} assigned.`);
      setLookupResult((prev) => prev ? { ...prev, user: { ...prev.user, nfcId: badgeInput.trim() } } : prev);
      setBadgeInput(''); setAssigningBadge(false);
    } catch { setBadgeError('Failed to assign badge.'); } finally { setBadgeAssigning(false); }
  };

  const getNextStatus = (status: string): string | null => {
    switch (status) { case 'PLACED': return 'IN_PROGRESS'; case 'IN_PROGRESS': return 'READY'; case 'READY': return 'COMPLETED'; default: return null; }
  };
  const getActionLabel = (status: string): string | null => {
    switch (status) { case 'PLACED': return 'Start'; case 'IN_PROGRESS': return 'Mark Order Ready'; case 'READY': return 'Mark Picked Up'; default: return null; }
  };

  return (
    <div className="font-mono space-y-8">
      {/* Badge Lookup */}
      <div className="border-2 border-brown-800 bg-cream-100 p-4">
        <h3 className="text-brown-800 text-sm uppercase tracking-wider mb-3 font-bold">Badge Lookup</h3>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-brown-800/70 text-xs uppercase mb-1">Slack ID, Badge ID, or Stasis Account</label>
            <div className="relative">
              <input
                ref={lookupInputRef}
                type="text"
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                onFocus={() => {
                  if (lookupBlurTimer.current) window.clearTimeout(lookupBlurTimer.current);
                  setLookupFocused(true);
                }}
                onBlur={() => {
                  lookupBlurTimer.current = window.setTimeout(() => setLookupFocused(false), 150);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                placeholder="Tap badge, enter Slack ID, or search name..."
                className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800"
              />
              {lookupFocused && (lookupSuggestLoading || lookupSuggestions.length > 0) && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 border-2 border-brown-800 bg-cream-50 shadow-lg max-h-80 overflow-y-auto">
                  {lookupSuggestLoading && lookupSuggestions.length === 0 ? (
                    <div className="px-3 py-2 text-brown-800/60 text-sm">Searching accounts...</div>
                  ) : (
                    lookupSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectLookupSuggestion(suggestion);
                        }}
                        className="w-full px-3 py-2 flex items-center gap-3 text-left border-b border-cream-200 last:border-b-0 hover:bg-cream-100"
                      >
                        {suggestion.image ? (
                          <img src={suggestion.image} alt="" className="w-9 h-9 rounded-full object-cover border border-cream-300 shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full border border-cream-300 bg-cream-200 shrink-0 flex items-center justify-center text-brown-800/50 text-xs uppercase">
                            {suggestion.name.slice(0, 2)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-brown-800 text-sm font-bold truncate">{suggestion.name}</span>
                          </div>
                          <p className="text-brown-800/60 text-xs truncate">
                            {suggestion.slackDisplayName || 'Stasis account'}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          <button onClick={() => handleLookup()} disabled={lookupLoading} className="bg-orange-500 text-cream-50 px-4 py-2 border-2 border-orange-500 hover:bg-orange-600 hover:border-orange-600 transition-colors uppercase text-sm tracking-wider disabled:opacity-50">Lookup</button>
          <button onClick={handleNFCScan} disabled={lookupLoading} className="border-2 border-brown-800 text-brown-800 px-4 py-2 hover:bg-brown-800 hover:text-cream-50 transition-colors uppercase text-sm tracking-wider disabled:opacity-50">Scan Badge</button>
        </div>

        {lookupLoading && <p className="text-brown-800/60 text-sm mt-2">Looking up...</p>}
        {lookupError && <p className="text-red-600 text-sm mt-2">{lookupError}</p>}

        {lookupResult && (
          <div className="mt-4 border-2 border-brown-800 bg-cream-50 p-4">
            <div className="flex justify-between items-start">
              <div className="flex gap-3 min-w-0">
                {lookupResult.user.image ? (
                  <img src={lookupResult.user.image} alt="" className="w-12 h-12 rounded-full object-cover border border-cream-300 shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full border border-cream-300 bg-cream-200 shrink-0 flex items-center justify-center text-brown-800/50 text-sm uppercase">
                    {lookupResult.user.name.slice(0, 2)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-brown-800 font-bold">{lookupResult.user.name}</p>
                  </div>
                  {lookupResult.user.email && <p className="text-brown-800/60 text-sm">{lookupResult.user.email}</p>}
                  {(lookupResult.user.slackDisplayName || lookupResult.user.slackId) && (
                    <p className="text-brown-800/60 text-xs mt-1">
                      Slack: {lookupResult.user.slackDisplayName || lookupResult.user.slackId}
                      {lookupResult.user.slackDisplayName && lookupResult.user.slackId ? ` (${lookupResult.user.slackId})` : ''}
                    </p>
                  )}
                  {lookupResult.user.nfcId && <p className="text-brown-800/60 text-xs mt-1">Badge: {lookupResult.user.nfcId}</p>}
                  {lookupResult.team && <p className="text-brown-800/80 text-sm mt-1">Team: {lookupResult.team.name}</p>}
                </div>
              </div>
              <button onClick={() => { setLookupResult(null); setLookupInput(''); }} className="text-brown-800/50 hover:text-brown-800 text-lg leading-none">x</button>
            </div>

            {lookupResult.activeOrder && (
              <div className="mt-3 pt-3 border-t border-cream-200">
                <p className="text-xs uppercase tracking-wider text-brown-800/60 mb-1">Active Order</p>
                <span className={`inline-block px-2 py-0.5 text-xs uppercase border ${STATUS_COLORS[lookupResult.activeOrder.status]}`}>{lookupResult.activeOrder.status.replace('_', ' ')}</span>
                <ul className="mt-1 text-sm text-brown-800/80">
                  {lookupResult.activeOrder.items.map((item) => <li key={item.id}>{item.item.name} x{item.quantity}</li>)}
                </ul>
              </div>
            )}

            {lookupResult.activeRentals && lookupResult.activeRentals.length > 0 && (
              <div className="mt-3 pt-3 border-t border-cream-200">
                <p className="text-xs uppercase tracking-wider text-brown-800/60 mb-1">Active Rentals</p>
                <ul className="text-sm text-brown-800/80">
                  {lookupResult.activeRentals.map((r) => <li key={r.id}>{r.tool.name}</li>)}
                </ul>
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-cream-200">
              {!assigningBadge ? (
                <button onClick={() => { setAssigningBadge(true); setBadgeError(null); setBadgeSuccess(null); setTimeout(() => badgeInputRef.current?.focus(), 50); }} className="border-2 border-brown-800 text-brown-800 px-3 py-1 text-xs uppercase tracking-wider hover:bg-brown-800 hover:text-cream-50 transition-colors">
                  {lookupResult.user.nfcId ? 'Reassign Badge' : 'Assign Badge'}
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wider text-brown-800/60">Tap badge on reader or enter ID:</p>
                  <div className="flex gap-2">
                    <input ref={badgeInputRef} type="text" value={badgeInput} onChange={(e) => setBadgeInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAssignBadge()} placeholder="Tap badge..." className="flex-1 border-2 border-brown-800 bg-cream-50 px-3 py-1 text-sm text-brown-800" />
                    <button onClick={handleAssignBadge} disabled={badgeAssigning || !badgeInput.trim()} className="bg-orange-500 text-cream-50 px-3 py-1 text-xs uppercase tracking-wider hover:bg-orange-600 disabled:opacity-50">{badgeAssigning ? '...' : 'Save'}</button>
                    <button onClick={() => { setAssigningBadge(false); setBadgeInput(''); setBadgeError(null); }} className="border border-brown-800 text-brown-800 px-3 py-1 text-xs uppercase tracking-wider hover:bg-cream-200">Cancel</button>
                  </div>
                </div>
              )}
              {badgeError && <p className="text-red-600 text-xs mt-1">{badgeError}</p>}
              {badgeSuccess && <p className="text-green-600 text-xs mt-1">{badgeSuccess}</p>}
            </div>
          </div>
        )}
      </div>

      <UnifiedActivity
        orders={orders}
        rentals={rentals}
        manufacturing={manufacturing}
        loading={ordersLoading || rentalsLoading || manufacturingLoading}
        error={manufacturingError}
        updatingOrderId={updating}
        updatingRentalId={returning}
        updatingJobId={manufacturingUpdating}
        orderNextStatus={getNextStatus}
        orderActionLabel={getActionLabel}
        updateOrder={updateStatus}
        updateRental={updateRentalStatus}
        updateJob={updateManufacturingJob}
      />
    </div>
  );
}

type ActivityEntry =
  | { kind: 'order'; id: string; at: string; order: Order }
  | { kind: 'rental'; id: string; at: string; rental: Rental }
  | { kind: 'print'; id: string; at: string; job: ManufacturingJob };

function UnifiedActivity({
  orders,
  rentals,
  manufacturing,
  loading,
  error,
  updatingOrderId,
  updatingRentalId,
  updatingJobId,
  orderNextStatus,
  orderActionLabel,
  updateOrder,
  updateRental,
  updateJob,
}: Readonly<{
  orders: Order[];
  rentals: Rental[];
  manufacturing: ManufacturingState | null;
  loading: boolean;
  error: string | null;
  updatingOrderId: string | null;
  updatingRentalId: string | null;
  updatingJobId: string | null;
  orderNextStatus: (status: string) => string | null;
  orderActionLabel: (status: string) => string | null;
  updateOrder: (orderId: string, newStatus: string) => Promise<void>;
  updateRental: (rental: Rental, status: Rental['status']) => Promise<void>;
  updateJob: (job: ManufacturingJob, patch: Record<string, unknown>) => Promise<void>;
}>) {
  const [rejectingPrint, setRejectingPrint] = useState<ManufacturingJob | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const entries: ActivityEntry[] = [
    ...orders
      .filter((order) => order.status !== 'COMPLETED' && order.status !== 'CANCELLED')
      .map((order) => ({ kind: 'order' as const, id: order.id, at: order.createdAt, order })),
    ...rentals
      .filter((rental) => rental.status !== 'RETURNED' && rental.status !== 'CANCELLED')
      .map((rental) => ({ kind: 'rental' as const, id: rental.id, at: rental.createdAt, rental })),
    ...(manufacturing?.jobs ?? [])
      .filter((job) => job.status === 'PENDING' || job.status === 'READY')
      .map((job) => ({ kind: 'print' as const, id: job.id, at: job.submittedAt, job })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <section>
      <h2 className="text-brown-800 font-bold text-lg uppercase tracking-wide mb-4">Activity</h2>

      {loading ? (
        <div className="flex justify-center py-12"><div className="loader" /></div>
      ) : entries.length === 0 ? (
        <p className="text-brown-800/60 text-sm">No active requests.</p>
      ) : (
        <div className="space-y-4">
          {error && <p className="text-red-600 text-sm">{error}</p>}
          {entries.map((entry) => {
            if (entry.kind === 'order') {
              const order = entry.order;
              const nextStatus = orderNextStatus(order.status);
              const actionLabel = orderActionLabel(order.status);
              return (
                <ActivityCard
                  key={`order-${order.id}`}
                  label="Parts Order"
                  title={order.team.name}
                  id={order.id}
                  status={<span className={`inline-block px-2 py-0.5 text-xs uppercase border tracking-wider ${STATUS_COLORS[order.status]}`}>{statusLabel(order.status)}</span>}
                  meta={`Placed by ${order.placedBy.name} | ${formatLocation(order.floor, order.location)} | ${new Date(order.createdAt).toLocaleString()}`}
                  details={order.items.map((item) => `${item.item.name} x${item.quantity}`)}
                >
                  {nextStatus && actionLabel && (
                    <AdminActionButton
                      disabled={updatingOrderId === order.id}
                      onClick={() => void updateOrder(order.id, nextStatus)}
                    >
                      {updatingOrderId === order.id ? '...' : actionLabel}
                    </AdminActionButton>
                  )}
                  {(order.status === 'PLACED' || order.status === 'IN_PROGRESS') && (
                    <AdminActionButton
                      variant="muted"
                      disabled={updatingOrderId === order.id}
                      onClick={() => void updateOrder(order.id, 'CANCELLED')}
                    >
                      {updatingOrderId === order.id ? '...' : 'Cancel'}
                    </AdminActionButton>
                  )}
                </ActivityCard>
              );
            }

            if (entry.kind === 'rental') {
              const rental = entry.rental;
              const nextStatus = rentalNextStatus(rental.status);
              const actionLabel = rentalActionLabel(rental.status);
              return (
                <ActivityCard
                  key={`rental-${rental.id}`}
                  label="Tool Rental"
                  title={rental.team.name}
                  id={rental.id}
                  status={<span className={`inline-block px-2 py-0.5 text-xs uppercase border tracking-wider ${STATUS_COLORS[rental.status]}`}>{statusLabel(rental.status)}</span>}
                  meta={`${rental.tool.name} | Requested by ${rental.rentedBy.name} | ${formatLocation(rental.floor, rental.location)} | ${new Date(rental.createdAt).toLocaleString()}`}
                  details={[
                    rental.tool.name,
                    rental.returnRequestedAt ? `Marked returned: ${new Date(rental.returnRequestedAt).toLocaleString()}` : '',
                  ].filter(Boolean)}
                >
                  {nextStatus && actionLabel && (
                    <AdminActionButton
                      disabled={updatingRentalId === rental.id}
                      onClick={() => void updateRental(rental, nextStatus)}
                    >
                      {updatingRentalId === rental.id ? '...' : actionLabel}
                    </AdminActionButton>
                  )}
                  {rental.status === 'RETURN_REQUESTED' && (
                    <AdminActionButton
                      variant="muted"
                      disabled={updatingRentalId === rental.id}
                      onClick={() => void updateRental(rental, 'CHECKED_OUT')}
                    >
                      {updatingRentalId === rental.id ? '...' : 'Reject Return'}
                    </AdminActionButton>
                  )}
                  {(rental.status === 'PLACED' || rental.status === 'IN_PROGRESS' || rental.status === 'READY') && (
                    <AdminActionButton
                      variant="muted"
                      disabled={updatingRentalId === rental.id}
                      onClick={() => void updateRental(rental, 'CANCELLED')}
                    >
                      {updatingRentalId === rental.id ? '...' : 'Cancel'}
                    </AdminActionButton>
                  )}
                </ActivityCard>
              );
            }

            const job = entry.job;
            return (
              <ActivityCard
                key={`print-${job.id}`}
                label={job.urgent ? 'Urgent Print Request' : 'Print Request'}
                title={job.teamName}
                id={job.id}
                status={(
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {job.urgent && (
                      <span className="inline-flex border-2 border-red-700 bg-red-700 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-cream-50">
                        Urgent
                      </span>
                    )}
                    <StatusBadge value={job.status} />
                  </div>
                )}
                meta={`${job.projectName} | Requested by ${job.submittedBy.name || job.submittedBy.slackDisplayName || 'Unknown'} | ${submittedTime(job.submittedAt)}`}
                tone={job.urgent ? 'urgent' : 'default'}
                callout={job.urgent ? 'Team marked this project-critical.' : undefined}
                details={[
                  job.description,
                  job.estimatedMinutes ? `${minutesToHuman(job.estimatedMinutes)} team print allocation` : 'Awaiting print estimate',
                  `${job.material} | ${job.colour}`,
                  job.fileLink ? `File: ${job.fileLink}` : '',
                  job.notes ? `Notes: ${job.notes}` : '',
                ].filter(Boolean)}
              >
                {job.status === 'PENDING' && (
                  <>
                    <AdminActionButton
                      disabled={updatingJobId === job.id}
                      onClick={() => void updateJob(job, { status: 'QUEUED' })}
                    >
                      {updatingJobId === job.id ? '...' : 'Approve'}
                    </AdminActionButton>
                    <AdminActionButton
                      variant="muted"
                      disabled={updatingJobId === job.id}
                      onClick={() => {
                        setRejectingPrint(job);
                        setRejectReason('');
                      }}
                    >
                      {updatingJobId === job.id ? '...' : 'Reject'}
                    </AdminActionButton>
                  </>
                )}
                {job.status === 'READY' && (
                  <AdminActionButton
                    disabled={updatingJobId === job.id}
                    onClick={() => void updateJob(job, { markCollected: true })}
                  >
                    {updatingJobId === job.id ? '...' : 'Mark Picked Up'}
                  </AdminActionButton>
                )}
              </ActivityCard>
            );
          })}
        </div>
      )}
      {rejectingPrint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brown-800/50 p-4">
          <div className="w-full max-w-md border-2 border-brown-800 bg-cream-50 p-5 shadow-xl">
            <h4 className="text-brown-800 text-sm uppercase tracking-wider font-bold">
              Reject Print Request
            </h4>
            <p className="mt-2 text-sm text-brown-800/70">
              {rejectingPrint.projectName}
            </p>
            <label className="mt-4 block">
              <span className="block text-xs uppercase tracking-wider text-brown-800/60">
                Optional reason
              </span>
              <textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                className="mt-1 min-h-24 w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800"
              />
            </label>
            <div className="mt-5 flex gap-2">
              <AdminActionButton
                variant="danger"
                disabled={updatingJobId === rejectingPrint.id}
                onClick={() => {
                  void updateJob(rejectingPrint, { status: 'REJECTED_BY_ORGANIZER', rejectReason });
                  setRejectingPrint(null);
                  setRejectReason('');
                }}
              >
                Reject
              </AdminActionButton>
              <AdminActionButton
                variant="muted"
                disabled={updatingJobId === rejectingPrint.id}
                onClick={() => {
                  setRejectingPrint(null);
                  setRejectReason('');
                }}
              >
                Cancel
              </AdminActionButton>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ActivityCard({
  label,
  title,
  id,
  status,
  meta,
  tone = 'default',
  callout,
  details,
  children,
}: Readonly<{
  label: string;
  title: string;
  id: string;
  status: ReactNode;
  meta: string;
  tone?: 'default' | 'urgent';
  callout?: ReactNode;
  details: string[];
  children?: ReactNode;
}>) {
  return (
    <div className={`border-2 p-4 ${tone === 'urgent' ? 'border-red-700 bg-red-50' : 'border-brown-800 bg-cream-100'}`}>
      <div className="flex justify-between items-start flex-wrap gap-2 mb-3">
        <div>
          <p className={`text-xs uppercase tracking-wider mb-1 ${tone === 'urgent' ? 'font-bold text-red-700' : 'text-brown-800/50'}`}>{label}</p>
          <h3 className="text-brown-800 font-bold text-sm uppercase tracking-wide">
            {title}
            <span className="ml-2 text-brown-800/50 font-normal">#{id.slice(-6).toUpperCase()}</span>
          </h3>
          <p className="text-brown-800/60 text-xs">{meta}</p>
        </div>
        {status}
      </div>
      {callout && (
        <div className="mb-3 border-2 border-red-700 bg-cream-50 px-3 py-2 text-xs font-bold uppercase tracking-wider text-red-700">
          {callout}
        </div>
      )}
      <ul className="text-sm text-brown-800/80 space-y-0.5 mb-3">
        {details.map((detail) => <li key={detail}>{detail}</li>)}
      </ul>
      {children && <div className="flex gap-2 flex-wrap">{children}</div>}
    </div>
  );
}

function AdminActionButton({
  children,
  disabled = false,
  variant = 'primary',
  onClick,
}: Readonly<{
  children: ReactNode;
  disabled?: boolean;
  variant?: 'primary' | 'muted' | 'danger';
  onClick: () => void;
}>) {
  const variantClass = variant === 'danger'
    ? 'border-red-700 bg-red-600 text-cream-50 hover:bg-red-700'
    : variant === 'muted'
      ? 'border-brown-800 text-brown-800 hover:bg-brown-800 hover:text-cream-50'
      : 'border-orange-500 bg-orange-500 text-cream-50 hover:bg-orange-600 hover:border-orange-600';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`px-4 py-2 text-sm uppercase tracking-wider border-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantClass}`}
    >
      {children}
    </button>
  );
}

function rentalNextStatus(status: Rental['status']): Rental['status'] | null {
  switch (status) {
    case 'PLACED':
      return 'IN_PROGRESS';
    case 'IN_PROGRESS':
      return 'READY';
    case 'READY':
      return 'CHECKED_OUT';
    case 'CHECKED_OUT':
      return 'RETURNED';
    case 'RETURN_REQUESTED':
      return 'RETURNED';
    default:
      return null;
  }
}

function rentalActionLabel(status: Rental['status']): string | null {
  switch (status) {
    case 'PLACED':
      return 'Start';
    case 'IN_PROGRESS':
      return 'Mark Tool Ready';
    case 'READY':
      return 'Check Out';
    case 'CHECKED_OUT':
      return 'Mark Returned';
    case 'RETURN_REQUESTED':
      return 'Approve Return';
    default:
      return null;
  }
}

function formatLocation(floor: number, location: string): string {
  const parts = [];
  if (floor) parts.push(`Floor ${floor}`);
  if (location) parts.push(location);
  return parts.join(' | ') || 'No location';
}
