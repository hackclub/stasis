'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from "@/lib/auth-client";

interface Prize {
  id: string;
  name: string;
  description: string;
  xpCost: number;
  quantity: number | null;
  claimed: number;
  userClaimed: boolean;
  weekStart: string;
  weekEnd: string;
}

interface ClaimedPrize {
  id: string;
  prize: {
    id: string;
    name: string;
    description: string;
    xpCost: number;
  };
  claimedAt: string;
}

function getWeekDateRange(): { start: Date; end: Date; display: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  const start = new Date(now);
  start.setDate(now.getDate() + mondayOffset);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  
  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const display = `${formatDate(start)} - ${formatDate(end)}`;
  
  return { start, end, display };
}

export default function PrizesPage() {
  const { data: session } = useSession();
  const [xpBalance, setXpBalance] = useState<number>(0);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [claimedPrizes, setClaimedPrizes] = useState<ClaimedPrize[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const weekRange = getWeekDateRange();

  const fetchData = useCallback(async () => {
    try {
      const [xpRes, prizesRes] = await Promise.all([
        fetch('/api/xp'),
        fetch('/api/xp/prizes'),
      ]);

      if (xpRes.ok) {
        const xpData = await xpRes.json();
        setXpBalance(xpData.balance ?? 0);
      }

      if (prizesRes.ok) {
        const prizesData = await prizesRes.json();
        setPrizes(prizesData.available ?? []);
        setClaimedPrizes(prizesData.claimed ?? []);
      }
    } catch (err) {
      console.error('Failed to fetch prizes data:', err);
      setError('Failed to load prizes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [session, fetchData]);

  const handleClaim = async (prizeId: string) => {
    setClaiming(prizeId);
    setError(null);

    try {
      const res = await fetch(`/api/xp/prizes/${prizeId}/claim`, {
        method: 'POST',
      });

      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        setError(data.error ?? 'Failed to claim prize');
      }
    } catch (err) {
      console.error('Failed to claim prize:', err);
      setError('Failed to claim prize');
    } finally {
      setClaiming(null);
    }
  };

  if (!session) {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* XP Balance Header */}
      <div className="bg-cream-100 border-2 border-cream-400 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-brand-500 text-lg uppercase tracking-wide">Your XP Balance</h2>
            <p className="text-cream-800 text-4xl font-bold">{xpBalance.toLocaleString()} XP</p>
          </div>
          <div className="text-right">
            <p className="text-cream-700 text-xs uppercase tracking-wide">Current Week</p>
            <p className="text-cream-800 text-lg">{weekRange.display}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-600/20 border-2 border-red-600/50 p-4">
          <p className="text-red-500">{error}</p>
        </div>
      )}

      {/* Available Prizes */}
      <div>
        <h2 className="text-brand-500 text-xl uppercase tracking-wide mb-4">Available Prizes</h2>
        
        {loading ? (
          <div className="p-8 text-center">
            <p className="text-cream-700">Loading prizes...</p>
          </div>
        ) : prizes.length === 0 ? (
          <div className="bg-cream-100 border-2 border-cream-400 p-8 text-center">
            <p className="text-cream-700">No prizes available this week.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {prizes.map((prize) => {
              const canAfford = xpBalance >= prize.xpCost;
              const isOutOfStock = prize.quantity !== null && prize.claimed >= prize.quantity;
              const canClaim = canAfford && !prize.userClaimed && !isOutOfStock;
              const remaining = prize.quantity !== null ? prize.quantity - prize.claimed : null;

              return (
                <div
                  key={prize.id}
                  className={`bg-cream-100 border-2 p-4 flex flex-col ${
                    prize.userClaimed
                      ? 'border-brand-500/50'
                      : 'border-cream-400'
                  }`}
                >
                  <div className="flex-1">
                    <h3 className="text-cream-800 text-lg font-medium mb-1">{prize.name}</h3>
                    <p className="text-cream-700 text-sm mb-3">{prize.description}</p>
                    
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-brand-400 font-bold">{prize.xpCost.toLocaleString()} XP</p>
                      {remaining !== null && (
                        <p className="text-cream-600 text-xs uppercase">
                          {remaining > 0 ? `${remaining} left` : 'Sold out'}
                        </p>
                      )}
                    </div>
                  </div>

                  {prize.userClaimed ? (
                    <div className="bg-brand-500/20 border border-brand-500/50 px-4 py-2 text-center">
                      <span className="text-brand-400 uppercase tracking-wide text-sm">Claimed ✓</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleClaim(prize.id)}
                      disabled={!canClaim || claiming === prize.id}
                      className={`px-4 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer ${
                        canClaim
                          ? 'bg-brand-500 hover:bg-brand-400 text-white'
                          : 'bg-cream-300 text-cream-600 cursor-not-allowed'
                      }`}
                    >
                      {claiming === prize.id
                        ? 'Claiming...'
                        : isOutOfStock
                        ? 'Sold Out'
                        : !canAfford
                        ? 'Not Enough XP'
                        : 'Claim'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Claimed Prizes History */}
      {claimedPrizes.length > 0 && (
        <div>
          <h2 className="text-brand-500 text-xl uppercase tracking-wide mb-4">Your Claimed Prizes</h2>
          <div className="bg-cream-100 border-2 border-cream-400 divide-y divide-cream-400">
            {claimedPrizes.map((claim) => (
              <div key={claim.id} className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="text-cream-800 font-medium">{claim.prize.name}</h3>
                  <p className="text-cream-600 text-sm">{claim.prize.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-brand-400 text-sm">{claim.prize.xpCost.toLocaleString()} XP</p>
                  <p className="text-cream-600 text-xs">
                    {new Date(claim.claimedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
