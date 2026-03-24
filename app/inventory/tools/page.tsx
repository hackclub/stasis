'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from '@/lib/auth-client';
import { ToolCard } from '@/app/components/inventory/ToolCard';
import { RentalTimer } from '@/app/components/inventory/RentalTimer';

interface Tool {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  available: boolean;
}

interface Rental {
  id: string;
  toolId: string;
  status: 'CHECKED_OUT' | 'RETURNED';
  floor: number;
  location: string;
  dueAt: string | null;
  createdAt: string;
  returnedAt: string | null;
  tool: { id: string; name: string; description?: string; imageUrl?: string };
  rentedBy: { id: string; name: string; email: string };
}

const MAX_CONCURRENT_RENTALS = 2;

export default function ToolsPage() {
  const { data: session } = useSession();
  const [tools, setTools] = useState<Tool[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rentModalToolId, setRentModalToolId] = useState<string | null>(null);
  const [floor, setFloor] = useState(1);
  const [location, setLocation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const activeRentals = rentals.filter(r => r.status === 'CHECKED_OUT');

  const fetchTools = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/tools');
      if (!res.ok) throw new Error('Failed to load tools');
      const data = await res.json();
      setTools(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tools');
    }
  }, []);

  const fetchRentals = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/rentals');
      if (!res.ok) return;
      const data = await res.json();
      setRentals(data);
    } catch {
      // Ignore - user might not be on a team
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    Promise.all([fetchTools(), fetchRentals()]).finally(() => setLoading(false));
  }, [session, fetchTools, fetchRentals]);

  const handleRent = async () => {
    if (!rentModalToolId || !location.trim()) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/inventory/rentals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolId: rentModalToolId, floor, location: location.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to rent tool');
      }

      setRentModalToolId(null);
      setFloor(1);
      setLocation('');
      setSuccessMessage('Tool rented successfully!');
      fetchTools();
      fetchRentals();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rent tool');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openRentModal = (toolId: string) => {
    setError(null);
    setRentModalToolId(toolId);
    setFloor(1);
    setLocation('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div>
      {/* Success message */}
      {successMessage && (
        <div className="mb-6 border-2 border-green-600 bg-green-50 px-4 py-3 text-green-800 text-sm">
          {successMessage}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-6 border-2 border-red-600 bg-red-50 px-4 py-3 text-red-800 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Active rentals */}
      {activeRentals.length > 0 && (
        <div className="mb-8">
          <h2 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-4">
            Active Rentals ({activeRentals.length} / {MAX_CONCURRENT_RENTALS})
          </h2>
          <div className="space-y-3">
            {activeRentals.map(rental => (
              <div
                key={rental.id}
                className="border-2 border-orange-500 bg-orange-500/10 p-4 flex items-center justify-between gap-4"
              >
                <div>
                  <span className="text-brown-800 font-bold text-sm">{rental.tool.name}</span>
                  <span className="text-brown-800/50 text-xs ml-2">
                    Floor {rental.floor} - {rental.location}
                  </span>
                </div>
                <RentalTimer dueAt={rental.dueAt} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tools grid */}
      <h2 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-4">Available Tools</h2>
      {tools.length === 0 ? (
        <p className="text-brown-800/50 text-sm">No tools available.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tools.map(tool => (
            <ToolCard key={tool.id} tool={tool} onRent={openRentModal} />
          ))}
        </div>
      )}

      {/* Rent modal */}
      {rentModalToolId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center font-mono">
          <div className="absolute inset-0 bg-[#3D3229]/80" onClick={() => setRentModalToolId(null)} />
          <div className="relative bg-cream-100 border-2 border-brown-800 p-8 max-w-md w-full">
            <h2 className="text-brown-800 font-bold text-lg uppercase tracking-wide mb-6">Rent Tool</h2>

            <p className="text-brown-800 text-sm mb-4">
              {tools.find(t => t.id === rentModalToolId)?.name}
            </p>

            {/* Floor dropdown */}
            <div className="mb-4">
              <label className="block text-brown-800 text-sm uppercase tracking-wider mb-1">Floor</label>
              <select
                value={floor}
                onChange={e => setFloor(Number(e.target.value))}
                className="w-full border-2 border-brown-800 bg-cream-50 text-brown-800 px-3 py-2 text-sm"
              >
                <option value={1}>Floor 1</option>
                <option value={2}>Floor 2</option>
                <option value={3}>Floor 3</option>
              </select>
            </div>

            {/* Location input */}
            <div className="mb-6">
              <label className="block text-brown-800 text-sm uppercase tracking-wider mb-1">Location</label>
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="Room number or table"
                className="w-full border-2 border-brown-800 bg-cream-50 text-brown-800 px-3 py-2 text-sm placeholder:text-brown-800/30"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setRentModalToolId(null)}
                className="flex-1 py-2 text-sm uppercase tracking-wider border-2 border-brown-800 text-brown-800 hover:bg-cream-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRent}
                disabled={!location.trim() || isSubmitting}
                className="flex-1 py-2 text-sm uppercase tracking-wider border-2 border-brown-800 bg-orange-500 text-cream-50 hover:bg-orange-600 disabled:opacity-30 disabled:hover:bg-orange-500 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Renting...' : 'Confirm Rent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
