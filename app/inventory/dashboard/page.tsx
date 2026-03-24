'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from '@/lib/auth-client';
import { useInventorySSE } from '@/lib/hooks/useInventorySSE';
import { OrderStatusBar } from '@/app/components/inventory/OrderStatusBar';
import { RentalTimer } from '@/app/components/inventory/RentalTimer';
import Link from 'next/link';

interface AccessInfo {
  allowed: boolean;
  reason?: string;
  isAdmin: boolean;
  teamId?: string;
  teamName?: string;
}

interface OrderItem {
  id: string;
  quantity: number;
  item: { id: string; name: string; imageUrl?: string };
}

interface Order {
  id: string;
  status: 'PLACED' | 'IN_PROGRESS' | 'READY' | 'COMPLETED';
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

interface TeamDetail {
  id: string;
  name: string;
  members: Array<{ id: string; name: string; image?: string }>;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [access, setAccess] = useState<AccessInfo | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const lastEvent = useInventorySSE(access?.teamId ?? null);

  const fetchAccess = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/access');
      if (!res.ok) return null;
      const data = await res.json();
      setAccess(data);
      return data as AccessInfo;
    } catch {
      return null;
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/orders');
      if (!res.ok) return;
      const data = await res.json();
      setOrders(data);
    } catch {
      // Ignore
    }
  }, []);

  const fetchRentals = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/rentals');
      if (!res.ok) return;
      const data = await res.json();
      setRentals(data);
    } catch {
      // Ignore
    }
  }, []);

  const fetchTeam = useCallback(async (teamId: string) => {
    try {
      const res = await fetch(`/api/inventory/teams/${teamId}`);
      if (!res.ok) return;
      const data = await res.json();
      setTeam(data);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const accessData = await fetchAccess();
      if (accessData?.teamId) {
        await Promise.all([
          fetchOrders(),
          fetchRentals(),
          fetchTeam(accessData.teamId),
        ]);
      }
      setLoading(false);
    })();
  }, [session, fetchAccess, fetchOrders, fetchRentals, fetchTeam]);

  // Re-fetch on SSE events
  useEffect(() => {
    if (!lastEvent) return;
    const type = lastEvent.type;
    if (type === 'order_placed' || type === 'order_updated') {
      fetchOrders();
    }
    if (type === 'rental_created' || type === 'rental_returned') {
      fetchRentals();
    }
  }, [lastEvent, fetchOrders, fetchRentals]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="loader" />
      </div>
    );
  }

  if (!access?.teamId) {
    return (
      <div className="text-center py-20">
        <h2 className="text-brown-800 text-lg uppercase tracking-wide mb-4">No Team</h2>
        <p className="text-brown-800/60 text-sm mb-6">
          You need to join or create a team before using inventory.
        </p>
        <Link
          href="/inventory/team"
          className="inline-block px-6 py-2 border-2 border-brown-800 text-brown-800 uppercase text-sm tracking-wider hover:bg-brown-800 hover:text-cream-50 transition-colors"
        >
          Go to Team Page
        </Link>
      </div>
    );
  }

  const activeOrder = orders.find(o => o.status !== 'COMPLETED');
  const pastOrders = orders.filter(o => o.status === 'COMPLETED');
  const activeRentals = rentals.filter(r => r.status === 'CHECKED_OUT');
  const pastRentals = rentals.filter(r => r.status === 'RETURNED');

  return (
    <div className="space-y-8">
      {/* Active Order */}
      <section>
        <h2 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-4">Active Order</h2>
        {activeOrder ? (
          <div className="border-2 border-brown-800 bg-cream-100 p-6">
            <div className="mb-4">
              <OrderStatusBar status={activeOrder.status} />
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-brown-800/60 mb-4">
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

      {/* Team Info */}
      {team && (
        <section>
          <h2 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-4">Team</h2>
          <div className="border-2 border-brown-800 bg-cream-100 p-4">
            <h3 className="text-brown-800 font-bold text-sm mb-3">{team.name}</h3>
            <div className="flex flex-wrap gap-3">
              {team.members.map(member => (
                <div key={member.id} className="flex items-center gap-2">
                  {member.image ? (
                    <img src={member.image} alt="" className="w-6 h-6 border border-cream-400" />
                  ) : (
                    <div className="w-6 h-6 bg-cream-200 border border-cream-400" />
                  )}
                  <span className="text-brown-800 text-xs">{member.name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Order History */}
      <section>
        <h2 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-4">Order History</h2>
        {pastOrders.length > 0 ? (
          <div className="border-2 border-brown-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream-200 text-brown-800 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Items</th>
                  <th className="text-left px-4 py-2">Placed By</th>
                </tr>
              </thead>
              <tbody>
                {pastOrders.map(order => (
                  <tr key={order.id} className="border-t border-cream-400 bg-cream-100">
                    <td className="px-4 py-2 text-brown-800/70 whitespace-nowrap">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-brown-800">
                      {order.items.map(oi => `${oi.item.name} x${oi.quantity}`).join(', ')}
                    </td>
                    <td className="px-4 py-2 text-brown-800/70">{order.placedBy.name}</td>
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
