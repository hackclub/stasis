'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from '@/lib/auth-client';
import { useInventorySSE } from '@/lib/inventory/useInventorySSE';
import { OrderStatusBar } from '@/app/components/inventory/OrderStatusBar';
import { RentalTimer } from '@/app/components/inventory/RentalTimer';
import { TeamPanel } from '@/app/components/inventory/TeamPanel';
import { useInventoryAccess } from '../InventoryAccessContext';

interface OrderItem {
  id: string;
  quantity: number;
  item: { id: string; name: string; imageUrl?: string };
}

interface Order {
  id: string;
  status: 'PLACED' | 'IN_PROGRESS' | 'READY' | 'COMPLETED' | 'CANCELLED';
  floor: number;
  location: string;
  items: OrderItem[];
  placedBy: { id: string; name: string; email: string };
  createdAt: string;
}

interface Rental {
  id: string;
  status: 'CHECKED_OUT' | 'RETURNED';
  floor: number;
  location: string;
  dueAt: string | null;
  createdAt: string;
  returnedAt: string | null;
  tool: { id: string; name: string };
  rentedBy: { id: string; name: string; email: string };
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const access = useInventoryAccess();
  const [orders, setOrders] = useState<Order[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState(false);

  const lastEvent = useInventorySSE(access?.teamId ?? null);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/orders');
      if (res.ok) setOrders(await res.json());
    } catch {}
  }, []);

  const fetchRentals = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/rentals');
      if (res.ok) setRentals(await res.json());
    } catch {}
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    if (access?.teamId) {
      await Promise.all([fetchOrders(), fetchRentals()]);
    }
    setLoading(false);
  }, [access?.teamId, fetchOrders, fetchRentals]);

  useEffect(() => {
    if (!session) return;
    loadData();
  }, [session, loadData]);

  useEffect(() => {
    if (!lastEvent) return;
    const type = lastEvent.type;
    if (type === 'order_placed' || type === 'order_status_updated') {
      fetchOrders();
    }
    if (type === 'rental_created' || type === 'rental_returned') {
      fetchRentals();
    }
  }, [lastEvent, fetchOrders, fetchRentals]);

  const cancelOrder = async (orderId: string) => {
    setCancellingOrder(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/orders/${orderId}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to cancel order');
      }
      showSuccess('Order cancelled.');
      fetchOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel order');
    } finally {
      setCancellingOrder(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="loader" />
      </div>
    );
  }

  // No team -- delegate entirely to TeamPanel
  if (!access?.teamId) {
    return (
      <TeamPanel
        teamId={undefined}
        currentUserId={session?.user.id ?? ''}
        onTeamChanged={loadData}
      />
    );
  }

  const activeOrder = orders.find(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
  const pastOrders = orders.filter(o => o.status === 'COMPLETED' || o.status === 'CANCELLED');
  const activeRentals = rentals.filter(r => r.status === 'CHECKED_OUT');
  const pastRentals = rentals.filter(r => r.status === 'RETURNED');

  return (
    <div className="space-y-8">
      {successMessage && (
        <div className="border-2 border-green-600 bg-green-50 px-4 py-3 text-green-800 text-sm">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="border-2 border-red-600 bg-red-50 px-4 py-3 text-red-800 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* Active Order */}
      <section>
        <h2 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-4">Active Order</h2>
        {activeOrder ? (
          <div className="border-2 border-brown-800 bg-cream-100 p-6">
            <div className="mb-4">
              <OrderStatusBar status={activeOrder.status as 'PLACED' | 'IN_PROGRESS' | 'READY' | 'COMPLETED'} />
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-brown-800/60 mb-4">
              <span className="font-bold text-brown-800/80">#{activeOrder.id.slice(-6).toUpperCase()}</span>
              <span>Floor {activeOrder.floor}</span>
              <span>{activeOrder.location}</span>
              <span>Placed by {activeOrder.placedBy.name}</span>
              <span>{new Date(activeOrder.createdAt).toLocaleString()}</span>
            </div>
            <ul className="space-y-1">
              {activeOrder.items.map(oi => (
                <li key={oi.id} className="flex justify-between text-sm text-brown-800">
                  <span>{oi.item.name}</span>
                  <span className="text-brown-800/60">x{oi.quantity}</span>
                </li>
              ))}
            </ul>
            {(activeOrder.status === 'PLACED' || activeOrder.status === 'IN_PROGRESS') && (
              <button
                onClick={() => cancelOrder(activeOrder.id)}
                disabled={cancellingOrder}
                className="mt-4 px-4 py-2 text-sm uppercase tracking-wider border-2 border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-cream-50 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {cancellingOrder ? 'Cancelling...' : 'Cancel Order'}
              </button>
            )}
          </div>
        ) : (
          <p className="text-brown-800/50 text-sm">No active order.</p>
        )}
      </section>

      {/* Active Rentals */}
      <section>
        <h2 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-4">Active Rentals</h2>
        {activeRentals.length > 0 ? (
          <div className="space-y-3">
            {activeRentals.map(rental => (
              <div
                key={rental.id}
                className="border-2 border-brown-800 bg-cream-100 p-4 flex items-center justify-between gap-4"
              >
                <div>
                  <span className="text-brown-800 font-bold text-sm">{rental.tool.name}</span>
                  <div className="flex gap-3 text-xs text-brown-800/60 mt-1">
                    <span>Floor {rental.floor}</span>
                    <span>{rental.location}</span>
                    <span>by {rental.rentedBy.name}</span>
                  </div>
                </div>
                <RentalTimer dueAt={rental.dueAt} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-brown-800/50 text-sm">No active rentals.</p>
        )}
      </section>

      {/* Team */}
      <TeamPanel
        teamId={access.teamId}
        currentUserId={session?.user.id ?? ''}
        onTeamChanged={loadData}
      />

      {/* Order History */}
      <section>
        <h2 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-4">Order History</h2>
        {pastOrders.length > 0 ? (
          <div className="border-2 border-brown-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream-200 text-brown-800 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2">Order</th>
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Items</th>
                  <th className="text-left px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {pastOrders.map(order => (
                  <tr key={order.id} className="border-t border-cream-400 bg-cream-100">
                    <td className="px-4 py-2 text-brown-800 font-bold whitespace-nowrap">
                      #{order.id.slice(-6).toUpperCase()}
                    </td>
                    <td className="px-4 py-2 text-brown-800/70 whitespace-nowrap">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-brown-800">
                      {order.items.map(oi => `${oi.item.name} x${oi.quantity}`).join(', ')}
                    </td>
                    <td className="px-4 py-2 text-brown-800/70 text-xs uppercase">
                      {order.status === 'CANCELLED' ? 'Cancelled' : 'Completed'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-brown-800/50 text-sm">No past orders.</p>
        )}
      </section>

      {/* Rental History */}
      <section>
        <h2 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-4">Rental History</h2>
        {pastRentals.length > 0 ? (
          <div className="border-2 border-brown-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream-200 text-brown-800 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2">Tool</th>
                  <th className="text-left px-4 py-2">Rented</th>
                  <th className="text-left px-4 py-2">Returned</th>
                  <th className="text-left px-4 py-2">By</th>
                </tr>
              </thead>
              <tbody>
                {pastRentals.map(rental => (
                  <tr key={rental.id} className="border-t border-cream-400 bg-cream-100">
                    <td className="px-4 py-2 text-brown-800">{rental.tool.name}</td>
                    <td className="px-4 py-2 text-brown-800/70 whitespace-nowrap">
                      {new Date(rental.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-brown-800/70 whitespace-nowrap">
                      {rental.returnedAt ? new Date(rental.returnedAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-2 text-brown-800/70">{rental.rentedBy.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-brown-800/50 text-sm">No past rentals.</p>
        )}
      </section>
    </div>
  );
}
