'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from "@/lib/auth-client";
import { SHOP_ITEMS } from '@/lib/shop';

export default function ShopPage() {
  const { data: session } = useSession();
  const [bitsBalance, setBitsBalance] = useState<number>(0);
  const [bitsEarned, setBitsEarned] = useState<number>(0);
  const [bitsSpent, setBitsSpent] = useState<number>(0);
  const [purchasedItems, setPurchasedItems] = useState<Set<string>>(new Set());
  const [itemTotals, setItemTotals] = useState<Record<string, number>>({});
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [currencyRes, purchasesRes] = await Promise.all([
        fetch('/api/currency'),
        fetch('/api/shop/purchases'),
      ]);
      if (currencyRes.ok) {
        const { bitsEarned, bomCost, bitsBalance } = await currencyRes.json();
        setBitsEarned(bitsEarned);
        setBitsSpent(bomCost ?? 0);
        setBitsBalance(bitsBalance);
      }
      if (purchasesRes.ok) {
        const { purchasedItemIds, itemTotals } = await purchasesRes.json();
        setPurchasedItems(new Set(purchasedItemIds));
        setItemTotals(itemTotals);
      }
    } catch (err) {
      console.error('Failed to fetch shop data:', err);
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

  const handlePurchase = async (itemId: string) => {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;
    if (!confirm(`Spend ${item.bitsCost} bits on ${item.name}?`)) return;

    setPurchasing(itemId);
    try {
      const res = await fetch('/api/shop/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      if (res.ok) {
        const { newBalance, bitsSpent: cost } = await res.json();
        setBitsBalance(newBalance);
        setPurchasedItems(prev => new Set(prev).add(itemId));
        setItemTotals(prev => ({
          ...prev,
          [itemId]: (prev[itemId] ?? 0) + cost,
        }));
      } else {
        const { error } = await res.json();
        alert(error || 'Purchase failed');
      }
    } catch {
      alert('Purchase failed');
    } finally {
      setPurchasing(null);
    }
  };

  if (!session) {
    return null;
  }

  const inviteItem = SHOP_ITEMS.find(item => item.category === 'invite');
  const flightItem = SHOP_ITEMS.find(item => item.category === 'flight_stipend');
  const hasEventInvite = inviteItem ? purchasedItems.has(inviteItem.id) : false;

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
      </div>

      {loading ? (
        <div className="p-8 text-center">
          <p className="text-cream-700">Loading shop...</p>
        </div>
      ) : (
        <>
          {/* Event Invite */}
          {inviteItem && (
            <div>
              <h2 className="text-brand-500 text-xl uppercase tracking-wide mb-4">Event Invite</h2>
              <div className={`bg-cream-100 border-2 p-6 ${
                purchasedItems.has(inviteItem.id) || bitsBalance >= inviteItem.bitsCost ? 'border-brand-500' : 'border-cream-400'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-cream-800 text-xl font-medium mb-1">{inviteItem.name}</h3>
                    <p className="text-cream-700 text-sm mb-3">{inviteItem.description}</p>
                    <p className="text-brand-400 font-bold text-lg">{inviteItem.bitsCost.toLocaleString()} Bits</p>
                  </div>
                  <div className="sm:text-right">
                    {purchasedItems.has(inviteItem.id) ? (
                      <div className="bg-brand-500/20 border border-brand-500/50 px-6 py-3 text-center">
                        <span className="text-brand-400 uppercase tracking-wide text-sm font-bold">Purchased!</span>
                      </div>
                    ) : bitsBalance >= inviteItem.bitsCost ? (
                      <button
                        onClick={() => handlePurchase(inviteItem.id)}
                        disabled={purchasing === inviteItem.id}
                        className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 px-6 py-3 text-center w-full cursor-pointer transition-colors"
                      >
                        <span className="text-cream-100 uppercase tracking-wide text-sm font-bold">
                          {purchasing === inviteItem.id ? 'Buying...' : 'Buy'}
                        </span>
                      </button>
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

          {/* Flight Stipend */}
          {flightItem && (
            <div>
              <h2 className="text-brand-500 text-xl uppercase tracking-wide mb-4">Flight Stipend</h2>
              <div className={`bg-cream-100 border-2 p-6 ${
                !hasEventInvite ? 'border-cream-300 opacity-60' : bitsBalance >= flightItem.bitsCost ? 'border-brand-500' : 'border-cream-400'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-cream-800 text-xl font-medium mb-1">{flightItem.name}</h3>
                    <p className="text-cream-700 text-sm mb-3">{flightItem.description}</p>
                    <p className="text-brand-400 font-bold text-lg">{flightItem.bitsCost.toLocaleString()} Bits per increment</p>
                    {(itemTotals[flightItem.id] ?? 0) > 0 && (
                      <p className="text-cream-800 text-sm mt-2">
                        You&apos;ve put <span className="font-bold text-brand-400">${(itemTotals[flightItem.id] ?? 0).toLocaleString()}</span> toward your flight so far
                      </p>
                    )}
                  </div>
                  <div className="sm:text-right">
                    {!hasEventInvite ? (
                      <div className="bg-cream-300 px-6 py-3 text-center">
                        <span className="text-cream-600 uppercase tracking-wide text-sm">
                          Buy Event Invite first
                        </span>
                      </div>
                    ) : bitsBalance >= flightItem.bitsCost ? (
                      <button
                        onClick={() => handlePurchase(flightItem.id)}
                        disabled={purchasing === flightItem.id}
                        className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 px-6 py-3 text-center w-full cursor-pointer transition-colors"
                      >
                        <span className="text-cream-100 uppercase tracking-wide text-sm font-bold">
                          {purchasing === flightItem.id ? 'Buying...' : 'Buy +$10'}
                        </span>
                      </button>
                    ) : (
                      <div className="bg-cream-300 px-6 py-3 text-center">
                        <span className="text-cream-600 uppercase tracking-wide text-sm">
                          {(flightItem.bitsCost - bitsBalance).toLocaleString()} bits needed
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
