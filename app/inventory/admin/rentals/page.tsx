'use client';

import { useState, useEffect, useCallback } from 'react';
import { useInventorySSE } from '@/lib/hooks/useInventorySSE';

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

export default function AdminRentalsPage() {
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [returning, setReturning] = useState<string | null>(null);

  const sseEvent = useInventorySSE('admin');

  const fetchRentals = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/admin/rentals');
      if (res.ok) {
        const data = await res.json();
        setRentals(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRentals();
  }, [fetchRentals]);

  // Refetch on SSE event
  useEffect(() => {
    if (sseEvent) {
      fetchRentals();
    }
  }, [sseEvent, fetchRentals]);

  const markReturned = async (rentalId: string) => {
    setReturning(rentalId);
    try {
      const res = await fetch(`/api/inventory/admin/rentals/${rentalId}/return`, {
        method: 'PATCH',
      });
      if (res.ok) {
        await fetchRentals();
      }
    } catch {
      // silently fail
    } finally {
      setReturning(null);
    }
  };

  const isOverdue = (dueAt?: string) => {
    if (!dueAt) return false;
    return new Date(dueAt) < new Date();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12 font-mono">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div className="font-mono">
      <h3 className="text-brown-800 text-sm uppercase tracking-wider mb-4 font-bold">
        Active Rentals ({rentals.length})
      </h3>

      {rentals.length === 0 ? (
        <p className="text-brown-800/60 text-sm">No active rentals.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-2 border-brown-800 text-sm">
            <thead>
              <tr className="bg-brown-800 text-cream-50">
                <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">
                  Tool
                </th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">
                  Team
                </th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">
                  Rented By
                </th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">
                  Location
                </th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">
                  Checked Out
                </th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">
                  Due At
                </th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rentals.map((rental) => {
                const overdue = isOverdue(rental.dueAt);
                return (
                  <tr
                    key={rental.id}
                    className={`border-t ${
                      overdue ? 'bg-red-50 border-red-200' : 'border-cream-200'
                    }`}
                  >
                    <td className="px-3 py-2 text-brown-800 font-bold">
                      {rental.tool.name}
                      {overdue && (
                        <span className="ml-2 text-xs text-red-600 uppercase font-bold">
                          Overdue
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-brown-800/70">{rental.team.name}</td>
                    <td className="px-3 py-2 text-brown-800/70">{rental.rentedBy.name}</td>
                    <td className="px-3 py-2 text-brown-800/70">
                      {rental.floor && `Floor ${rental.floor}`}
                      {rental.floor && rental.location && ' - '}
                      {rental.location}
                      {!rental.floor && !rental.location && '--'}
                    </td>
                    <td className="px-3 py-2 text-brown-800/70 whitespace-nowrap">
                      {new Date(rental.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-brown-800/70 whitespace-nowrap">
                      {rental.dueAt
                        ? new Date(rental.dueAt).toLocaleString()
                        : '--'}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => markReturned(rental.id)}
                        disabled={returning === rental.id}
                        className="bg-orange-500 text-cream-50 px-3 py-1 text-xs uppercase tracking-wider hover:bg-orange-600 transition-colors disabled:opacity-50"
                      >
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
    </div>
  );
}
