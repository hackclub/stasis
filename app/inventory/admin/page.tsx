'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useInventorySSE } from '@/lib/inventory/useInventorySSE';

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
  floor: number;
  location: string;
  createdAt: string;
  dueAt?: string;
}

interface LookupResult {
  user: {
    id: string;
    name: string;
    email?: string;
    slackId?: string;
    nfcId?: string;
    image?: string;
  };
  team?: { name: string };
  activeOrder?: Order;
  activeRentals?: { id: string; toolName: string; checkedOutAt: string }[];
}

const STATUS_COLORS: Record<string, string> = {
  PLACED: 'bg-cream-200 text-brown-800 border-brown-800',
  IN_PROGRESS: 'bg-orange-400 text-cream-50 border-orange-500',
  READY: 'bg-orange-500 text-cream-50 border-orange-600',
  COMPLETED: 'bg-brown-800 text-cream-50 border-brown-900',
  CANCELLED: 'bg-cream-200 text-brown-800/50 border-brown-800/30',
};

const STATUS_TABS = ['All', 'PLACED', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED'] as const;

export default function AdminActivityPage() {
  // Orders
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [updating, setUpdating] = useState<string | null>(null);

  // Rentals
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [rentalsLoading, setRentalsLoading] = useState(true);
  const [returning, setReturning] = useState<string | null>(null);

  // Lookup
  const [lookupInput, setLookupInput] = useState('');
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

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

  const sseEvent = useInventorySSE('admin');

  const fetchOrders = useCallback(async () => {
    try {
      const params = statusFilter !== 'All' ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/inventory/admin/orders${params}`);
      if (res.ok) setOrders(await res.json());
    } catch {} finally {
      setOrdersLoading(false);
    }
  }, [statusFilter]);

  const fetchRentals = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/admin/rentals');
      if (res.ok) setRentals(await res.json());
    } catch {} finally {
      setRentalsLoading(false);
    }
  }, []);

  useEffect(() => { setOrdersLoading(true); fetchOrders(); }, [fetchOrders]);
  useEffect(() => { fetchRentals(); }, [fetchRentals]);
  useEffect(() => {
    if (!sseEvent) return;
    const type = sseEvent.type;
    if (type === 'order_placed' || type === 'order_status_updated') fetchOrders();
    if (type === 'rental_created' || type === 'rental_returned') fetchRentals();
  }, [sseEvent, fetchOrders, fetchRentals]);

  const updateStatus = async (orderId: string, newStatus: string) => {
    setUpdating(orderId);
    try {
      const res = await fetch(`/api/inventory/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) await fetchOrders();
    } catch {} finally { setUpdating(null); }
  };

  const markReturned = async (rentalId: string) => {
    setReturning(rentalId);
    try {
      const res = await fetch(`/api/inventory/admin/rentals/${rentalId}/return`, { method: 'PATCH' });
      if (res.ok) await fetchRentals();
    } catch {} finally { setReturning(null); }
  };

  const isOverdue = (dueAt?: string) => dueAt ? new Date(dueAt) < new Date() : false;

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
    setLookupLoading(true); setLookupError(null); setLookupResult(null);
    try {
      const res = await fetch(`/api/inventory/lookup/${encodeURIComponent(id)}`);
      if (!res.ok) { setLookupError('User not found.'); return; }
      setLookupResult(await res.json());
    } catch { setLookupError('Lookup failed.'); } finally { setLookupLoading(false); }
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
      setBadgeInput(''); setAssigningBadge(false);
    } catch { setBadgeError('Failed to assign badge.'); } finally { setBadgeAssigning(false); }
  };

  const getNextStatus = (status: string): string | null => {
    switch (status) { case 'PLACED': return 'IN_PROGRESS'; case 'IN_PROGRESS': return 'READY'; case 'READY': return 'COMPLETED'; default: return null; }
  };
  const getActionLabel = (status: string): string | null => {
    switch (status) { case 'PLACED': return 'Start'; case 'IN_PROGRESS': return 'Mark Ready'; case 'READY': return 'Mark Completed'; default: return null; }
  };

  return (
    <div className="font-mono space-y-8">
      {/* Badge Lookup */}
      <div className="border-2 border-brown-800 bg-cream-100 p-4">
        <h3 className="text-brown-800 text-sm uppercase tracking-wider mb-3 font-bold">Badge Lookup</h3>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-brown-800/70 text-xs uppercase mb-1">Slack ID or Badge ID</label>
            <input ref={lookupInputRef} type="text" value={lookupInput} onChange={(e) => setLookupInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLookup()} placeholder="Tap badge or enter Slack ID..." className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800" />
          </div>
          <button onClick={() => handleLookup()} disabled={lookupLoading} className="bg-orange-500 text-cream-50 px-4 py-2 border-2 border-orange-500 hover:bg-orange-600 hover:border-orange-600 transition-colors uppercase text-sm tracking-wider disabled:opacity-50">Lookup</button>
          <button onClick={handleNFCScan} disabled={lookupLoading} className="border-2 border-brown-800 text-brown-800 px-4 py-2 hover:bg-brown-800 hover:text-cream-50 transition-colors uppercase text-sm tracking-wider disabled:opacity-50">Scan Badge</button>
        </div>

        {lookupLoading && <p className="text-brown-800/60 text-sm mt-2">Looking up...</p>}
        {lookupError && <p className="text-red-600 text-sm mt-2">{lookupError}</p>}

        {lookupResult && (
          <div className="mt-4 border-2 border-brown-800 bg-cream-50 p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-brown-800 font-bold">{lookupResult.user.name}</p>
                {lookupResult.user.email && <p className="text-brown-800/60 text-sm">{lookupResult.user.email}</p>}
                {lookupResult.user.slackId && <p className="text-brown-800/60 text-xs mt-1">Slack: {lookupResult.user.slackId}</p>}
                {lookupResult.user.nfcId && <p className="text-brown-800/60 text-xs mt-1">Badge: {lookupResult.user.nfcId}</p>}
                {lookupResult.team && <p className="text-brown-800/80 text-sm mt-1">Team: {lookupResult.team.name}</p>}
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
                  {lookupResult.activeRentals.map((r) => <li key={r.id}>{r.toolName}</li>)}
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

      {/* === Orders Section === */}
      <section>
        <h2 className="text-brown-800 font-bold text-lg uppercase tracking-wide mb-4">Orders</h2>

        <div className="flex gap-2 mb-4 flex-wrap">
          {STATUS_TABS.map((tab) => (
            <button key={tab} onClick={() => setStatusFilter(tab)} className={`px-3 py-1 text-xs uppercase tracking-wider border-2 transition-colors ${statusFilter === tab ? 'border-orange-500 bg-orange-500 text-cream-50' : 'border-brown-800 text-brown-800 hover:bg-cream-200'}`}>
              {tab.replace('_', ' ')}
            </button>
          ))}
        </div>

        {ordersLoading ? (
          <div className="flex justify-center py-12"><div className="loader" /></div>
        ) : orders.length === 0 ? (
          <p className="text-brown-800/60 text-sm">No orders found.</p>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const nextStatus = getNextStatus(order.status);
              const actionLabel = getActionLabel(order.status);
              return (
                <div key={order.id} className="border-2 border-brown-800 bg-cream-100 p-4">
                  <div className="flex justify-between items-start flex-wrap gap-2 mb-3">
                    <div>
                      <h3 className="text-brown-800 font-bold text-sm uppercase tracking-wide">
                        {order.team.name}
                        <span className="ml-2 text-brown-800/50 font-normal">#{order.id.slice(-6).toUpperCase()}</span>
                      </h3>
                      <p className="text-brown-800/60 text-xs">
                        Placed by {order.placedBy.name}
                        {order.floor && ` -- Floor ${order.floor}`}
                        {order.location && ` -- ${order.location}`}
                      </p>
                      <p className="text-brown-800/40 text-xs mt-0.5">{new Date(order.createdAt).toLocaleString()}</p>
                    </div>
                    <span className={`inline-block px-2 py-0.5 text-xs uppercase border tracking-wider ${STATUS_COLORS[order.status]}`}>{order.status.replace('_', ' ')}</span>
                  </div>
                  <ul className="text-sm text-brown-800/80 space-y-0.5 mb-3">
                    {order.items.map((item) => <li key={item.id}>{item.item.name} x{item.quantity}</li>)}
                  </ul>
                  <div className="flex gap-2">
                    {nextStatus && actionLabel && (
                      <button onClick={() => updateStatus(order.id, nextStatus)} disabled={updating === order.id} className="bg-orange-500 text-cream-50 px-4 py-2 hover:bg-orange-600 transition-colors uppercase text-sm tracking-wider disabled:opacity-50">
                        {updating === order.id ? '...' : actionLabel}
                      </button>
                    )}
                    {(order.status === 'PLACED' || order.status === 'IN_PROGRESS') && (
                      <button onClick={() => updateStatus(order.id, 'CANCELLED')} disabled={updating === order.id} className="border-2 border-orange-500 text-orange-500 px-4 py-2 hover:bg-orange-500 hover:text-cream-50 transition-colors uppercase text-sm tracking-wider disabled:opacity-50">
                        {updating === order.id ? '...' : 'Cancel'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* === Rentals Section === */}
      <section>
        <h2 className="text-brown-800 font-bold text-lg uppercase tracking-wide mb-4">Active Rentals</h2>

        {rentalsLoading ? (
          <div className="flex justify-center py-12"><div className="loader" /></div>
        ) : rentals.length === 0 ? (
          <p className="text-brown-800/60 text-sm">No active rentals.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-2 border-brown-800 text-sm">
              <thead>
                <tr className="bg-brown-800 text-cream-50">
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">Tool</th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">Team</th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">Rented By</th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">Location</th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">Checked Out</th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">Due At</th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rentals.map((rental) => {
                  const overdue = isOverdue(rental.dueAt);
                  return (
                    <tr key={rental.id} className={`border-t ${overdue ? 'bg-red-50 border-red-200' : 'border-cream-200'}`}>
                      <td className="px-3 py-2 text-brown-800 font-bold">
                        {rental.tool.name}
                        {overdue && <span className="ml-2 text-xs text-red-600 uppercase font-bold">Overdue</span>}
                      </td>
                      <td className="px-3 py-2 text-brown-800/70">{rental.team.name}</td>
                      <td className="px-3 py-2 text-brown-800/70">{rental.rentedBy.name}</td>
                      <td className="px-3 py-2 text-brown-800/70">
                        {rental.floor && `Floor ${rental.floor}`}
                        {rental.floor && rental.location && ' - '}
                        {rental.location}
                        {!rental.floor && !rental.location && '--'}
                      </td>
                      <td className="px-3 py-2 text-brown-800/70 whitespace-nowrap">{new Date(rental.createdAt).toLocaleString()}</td>
                      <td className="px-3 py-2 text-brown-800/70 whitespace-nowrap">{rental.dueAt ? new Date(rental.dueAt).toLocaleString() : '--'}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => markReturned(rental.id)} disabled={returning === rental.id} className="bg-orange-500 text-cream-50 px-3 py-1 text-xs uppercase tracking-wider hover:bg-orange-600 transition-colors disabled:opacity-50">
                          {returning === rental.id ? '...' : 'Mark Returned'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
