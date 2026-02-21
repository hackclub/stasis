'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from "@/lib/auth-client";
import { SHOP_ITEMS } from '@/lib/shop';
import { QUALIFICATION_BITS_THRESHOLD } from '@/lib/tiers';

export default function ShopPage() {
  const { data: session } = useSession();
  const [bitsBalance, setBitsBalance] = useState<number>(0);
  const [bitsEarned, setBitsEarned] = useState<number>(0);
  const [bitsSpent, setBitsSpent] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/currency');
      if (res.ok) {
        const { bitsEarned, bomCost, bitsBalance } = await res.json();
        setBitsEarned(bitsEarned);
        setBitsSpent(bomCost ?? 0);
        setBitsBalance(bitsBalance);
      }
    } catch (err) {
      console.error('Failed to fetch currency balance:', err);
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

  if (!session) {
    return null;
  }

  const inviteItem = SHOP_ITEMS.find(item => item.category === 'invite');
  const flightItems = SHOP_ITEMS.filter(item => item.category === 'flight_stipend');

  return (
    <div className="space-y-8">
      {/* Bits Balance Header */}
      <div className="bg-cream-100 border-2 border-cream-400 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-brand-500 text-lg uppercase tracking-wide">Your Bits Balance</h2>
            <p className="text-cream-800 text-4xl font-bold">{bitsBalance.toLocaleString()} Bits</p>
          </div>
          <div className="text-right">
            <p className="text-cream-700 text-xs uppercase tracking-wide">Earned</p>
            <p className="text-cream-800 text-lg">{bitsEarned.toLocaleString()} bits</p>
            <p className="text-cream-700 text-xs uppercase tracking-wide mt-1">Spent on Parts</p>
            <p className="text-cream-800 text-lg">{bitsSpent.toLocaleString()} bits</p>
          </div>
        </div>
        {/* Qualification Progress */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-cream-700 text-xs uppercase tracking-wide">
              Qualification Progress
            </p>
            <p className="text-cream-700 text-xs">
              {bitsBalance} / {QUALIFICATION_BITS_THRESHOLD} bits
            </p>
          </div>
          <div className="w-full bg-cream-300 h-2">
            <div
              className="bg-brand-500 h-2 transition-all"
              style={{ width: `${Math.min(100, (bitsBalance / QUALIFICATION_BITS_THRESHOLD) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center">
          <p className="text-cream-700">Loading shop...</p>
        </div>
      ) : (
        <>
          {/* Event Invite — Prominently displayed */}
          {inviteItem && (
            <div>
              <h2 className="text-brand-500 text-xl uppercase tracking-wide mb-4">Event Invite</h2>
              <div className={`bg-cream-100 border-2 p-6 ${
                bitsBalance >= inviteItem.bitsCost ? 'border-brand-500' : 'border-cream-400'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-cream-800 text-xl font-medium mb-1">{inviteItem.name}</h3>
                    <p className="text-cream-700 text-sm mb-3">{inviteItem.description}</p>
                    <p className="text-brand-400 font-bold text-lg">{inviteItem.bitsCost.toLocaleString()} Bits</p>
                  </div>
                  <div className="sm:text-right">
                    {bitsBalance >= inviteItem.bitsCost ? (
                      <div className="bg-brand-500/20 border border-brand-500/50 px-6 py-3 text-center">
                        <span className="text-brand-400 uppercase tracking-wide text-sm font-bold">Qualified ✓</span>
                      </div>
                    ) : (
                      <div className="bg-cream-300 px-6 py-3 text-center">
                        <span className="text-cream-600 uppercase tracking-wide text-sm">
                          {(inviteItem.bitsCost - bitsBalance).toLocaleString()} bits needed
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Flight Stipends */}
          <div>
            <h2 className="text-brand-500 text-xl uppercase tracking-wide mb-4">Flight Stipends</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {flightItems.map((item) => {
                const canAfford = bitsBalance >= item.bitsCost;

                return (
                  <div
                    key={item.id}
                    className={`bg-cream-100 border-2 p-4 flex flex-col ${
                      canAfford ? 'border-brand-500/50' : 'border-cream-400'
                    }`}
                  >
                    <div className="flex-1">
                      <h3 className="text-cream-800 text-lg font-medium mb-1">{item.name}</h3>
                      <p className="text-cream-700 text-sm mb-3">{item.description}</p>
                      <p className="text-brand-400 font-bold mb-3">{item.bitsCost.toLocaleString()} Bits</p>
                    </div>
                    {canAfford ? (
                      <div className="bg-brand-500/20 border border-brand-500/50 px-4 py-2 text-center">
                        <span className="text-brand-400 uppercase tracking-wide text-sm">Qualified ✓</span>
                      </div>
                    ) : (
                      <div className="bg-cream-300 px-4 py-2 text-center">
                        <span className="text-cream-600 uppercase tracking-wide text-sm">
                          {(item.bitsCost - bitsBalance).toLocaleString()} bits needed
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
