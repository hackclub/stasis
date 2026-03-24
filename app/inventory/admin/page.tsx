'use client';

import { useState, useEffect, useCallback } from 'react';
import { useInventorySSE } from '@/lib/hooks/useInventorySSE';

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
  status: 'PLACED' | 'IN_PROGRESS' | 'READY' | 'COMPLETED';
  items: OrderItem[];
  createdAt: string;
}

interface LookupResult {
  user: {
    name: string;
    email?: string;
    slackId: string;
  };
  team?: {
    name: string;
  };
  activeOrder?: Order;
  activeRentals?: { id: string; toolName: string; checkedOutAt: string }[];
}

const STATUS_COLORS: Record<string, string> = {
  PLACED: 'bg-cream-200 text-brown-800 border-brown-800',
  IN_PROGRESS: 'bg-orange-400 text-cream-50 border-orange-500',
  READY: 'bg-orange-500 text-cream-50 border-orange-600',
  COMPLETED: 'bg-brown-800 text-cream-50 border-brown-900',
};

const STATUS_TABS = ['All', 'PLACED', 'IN_PROGRESS', 'READY', 'COMPLETED'] as const;

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [updating, setUpdating] = useState<string | null>(null);

  // NFC / Lookup
  const [lookupInput, setLookupInput] = useState('');
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const sseEvent = useInventorySSE('admin');

  const fetchOrders = useCallback(async () => {
    try {
      const params = statusFilter !== 'All' ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/inventory/admin/orders${params}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchOrders();
  }, [fetchOrders]);

  // Refetch on SSE event
  useEffect(() => {
    if (sseEvent) {
      fetchOrders();
    }
  }, [sseEvent, fetchOrders]);

  const updateStatus = async (orderId: string, newStatus: string) => {
    setUpdating(orderId);
    try {
      const res = await fetch(`/api/inventory/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        await fetchOrders();
      }
    } catch {
      // silently fail
    } finally {
      setUpdating(null);
    }
  };

  const handleLookup = async (slackId?: string) => {
    const id = slackId || lookupInput.trim();
    if (!id) return;
    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);
    try {
      const res = await fetch(`/api/inventory/lookup/${encodeURIComponent(id)}`);
      if (!res.ok) {
        setLookupError('User not found.');
        return;
      }
      const data = await res.json();
      setLookupResult(data);
    } catch {
      setLookupError('Lookup failed.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleNFCScan = async () => {
    try {
      if (!('NDEFReader' in window)) {
        setLookupError('NFC not supported on this device.');
        return;
      }
      // @ts-expect-error NDEFReader is not in all TS libs
      const ndef = new NDEFReader();
      await ndef.scan();
      ndef.addEventListener('reading', ({ serialNumber }: { serialNumber: string }) => {
        handleLookup(serialNumber);
      });
    } catch {
      setLookupError('NFC scan failed or was cancelled.');
    }
  };

  const getNextStatus = (status: string): string | null => {
    switch (status) {
      case 'PLACED': return 'IN_PROGRESS';
      case 'IN_PROGRESS': return 'READY';
      case 'READY': return 'COMPLETED';
      default: return null;
    }
  };

  const getActionLabel = (status: string): string | null => {
    switch (status) {
      case 'PLACED': return 'Start';
      case 'IN_PROGRESS': return 'Mark Ready';
      case 'READY': return 'Mark Completed';
      default: return null;
    }
  };

  return (
    <div className="font-mono">
      {/* NFC Lookup Section */}
      <div className="border-2 border-brown-800 bg-cream-100 p-4 mb-6">
        <h3 className="text-brown-800 text-sm uppercase tracking-wider mb-3 font-bold">
          Badge Lookup
        </h3>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-brown-800/70 text-xs uppercase mb-1">
              Slack ID
            </label>
            <input
              type="text"
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              placeholder="Enter Slack user ID..."
              className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800"
            />
          </div>
          <button
            onClick={() => handleLookup()}
            disabled={lookupLoading}
            className="bg-orange-500 text-cream-50 px-4 py-2 hover:bg-orange-600 transition-colors uppercase text-sm tracking-wider disabled:opacity-50"
          >
            Lookup
          </button>
          <button
            onClick={handleNFCScan}
            disabled={lookupLoading}
            className="border-2 border-brown-800 text-brown-800 px-4 py-2 hover:bg-brown-800 hover:text-cream-50 transition-colors uppercase text-sm tracking-wider disabled:opacity-50"
          >
            Scan Badge
          </button>
        </div>

        {lookupLoading && (
          <p className="text-brown-800/60 text-sm mt-2">Looking up...</p>
        )}
        {lookupError && (
          <p className="text-red-600 text-sm mt-2">{lookupError}</p>
        )}

        {lookupResult && (
          <div className="mt-4 border-2 border-brown-800 bg-cream-50 p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-brown-800 font-bold">{lookupResult.user.name}</p>
                {lookupResult.user.email && (
                  <p className="text-brown-800/60 text-sm">{lookupResult.user.email}</p>
                )}
                <p className="text-brown-800/60 text-xs mt-1">
                  Slack: {lookupResult.user.slackId}
                </p>
                {lookupResult.team && (
                  <p className="text-brown-800/80 text-sm mt-1">
                    Team: {lookupResult.team.name}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setLookupResult(null);
                  setLookupInput('');
                }}
                className="text-brown-800/50 hover:text-brown-800 text-lg leading-none"
              >
                x
              </button>
            </div>

            {lookupResult.activeOrder && (
              <div className="mt-3 pt-3 border-t border-cream-200">
                <p className="text-xs uppercase tracking-wider text-brown-800/60 mb-1">
                  Active Order
                </p>
                <span
                  className={`inline-block px-2 py-0.5 text-xs uppercase border ${STATUS_COLORS[lookupResult.activeOrder.status]}`}
                >
                  {lookupResult.activeOrder.status.replace('_', ' ')}
                </span>
                <ul className="mt-1 text-sm text-brown-800/80">
                  {lookupResult.activeOrder.items.map((item) => (
                    <li key={item.id}>
                      {item.item.name} x{item.quantity}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {lookupResult.activeRentals && lookupResult.activeRentals.length > 0 && (
              <div className="mt-3 pt-3 border-t border-cream-200">
                <p className="text-xs uppercase tracking-wider text-brown-800/60 mb-1">
                  Active Rentals
                </p>
                <ul className="text-sm text-brown-800/80">
                  {lookupResult.activeRentals.map((r) => (
                    <li key={r.id}>{r.toolName}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-3 py-1 text-xs uppercase tracking-wider border-2 transition-colors ${
              statusFilter === tab
                ? 'border-orange-500 bg-orange-500 text-cream-50'
                : 'border-brown-800 text-brown-800 hover:bg-cream-200'
            }`}
          >
            {tab.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="loader" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-brown-800/60">
          <p className="text-sm uppercase tracking-wider">No orders found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const nextStatus = getNextStatus(order.status);
            const actionLabel = getActionLabel(order.status);

            return (
              <div
                key={order.id}
                className="border-2 border-brown-800 bg-cream-100 p-4"
              >
                <div className="flex justify-between items-start flex-wrap gap-2 mb-3">
                  <div>
                    <h3 className="text-brown-800 font-bold text-sm uppercase tracking-wide">
                      {order.team.name}
                    </h3>
                    <p className="text-brown-800/60 text-xs">
                      Placed by {order.placedBy.name}
                      {order.floor && ` -- Floor ${order.floor}`}
                      {order.location && ` -- ${order.location}`}
                    </p>
                    <p className="text-brown-800/40 text-xs mt-0.5">
                      {new Date(order.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`inline-block px-2 py-0.5 text-xs uppercase border tracking-wider ${STATUS_COLORS[order.status]}`}
                  >
                    {order.status.replace('_', ' ')}
                  </span>
                </div>

                {/* Items */}
                <div className="mb-3">
                  <ul className="text-sm text-brown-800/80 space-y-0.5">
                    {order.items.map((item) => (
                      <li key={item.id}>
                        {item.item.name} x{item.quantity}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Actions */}
                {nextStatus && actionLabel && (
                  <button
                    onClick={() => updateStatus(order.id, nextStatus)}
                    disabled={updating === order.id}
                    className="bg-orange-500 text-cream-50 px-4 py-2 hover:bg-orange-600 transition-colors uppercase text-sm tracking-wider disabled:opacity-50"
                  >
                    {updating === order.id ? '...' : actionLabel}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
