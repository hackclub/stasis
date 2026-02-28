'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from "@/lib/auth-client";
import { SHOP_ITEMS, ShopItem } from '@/lib/shop';

interface ConfirmModalState {
  item: ShopItem;
  quantity: number;
}

function PurchaseConfirmModal({
  item,
  initialQuantity,
  bitsBalance,
  onConfirm,
  onClose,
  purchasing,
}: {
  item: ShopItem;
  initialQuantity: number;
  bitsBalance: number;
  onConfirm: (itemId: string, quantity: number) => void;
  onClose: () => void;
  purchasing: boolean;
}) {
  const [quantity, setQuantity] = useState(initialQuantity);
  const showQuantity = item.category === 'flight_stipend';
  const totalCost = item.bitsCost * quantity;
  const maxQuantity = Math.floor(bitsBalance / item.bitsCost);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-[#3D3229]/80" onClick={onClose} />
      <div className="relative bg-cream-100 border-2 border-brown-800 p-8 max-w-md w-full mx-4 shadow-lg">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-brown-800 hover:text-orange-500 text-2xl leading-none cursor-pointer"
        >
          &times;
        </button>

        <h2 className="text-xl uppercase tracking-wide mb-2 text-brown-800">Confirm Purchase</h2>
        <p className="text-brown-800 mb-6">
          {showQuantity
            ? `Buy ${item.name} to put toward your flight?`
            : `Spend ${item.bitsCost.toLocaleString()} bits on ${item.name}?`
          }
        </p>

        {showQuantity && (
          <div className="mb-6 space-y-4">
            <div>
              <label className="block text-sm uppercase tracking-wide mb-2 text-brown-800">
                Quantity
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="bg-cream-300 hover:bg-cream-400 disabled:opacity-50 w-10 h-10 flex items-center justify-center text-brown-800 text-xl cursor-pointer transition-colors"
                >
                  -
                </button>
                <input
                  type="number"
                  min={1}
                  max={maxQuantity}
                  value={quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val >= 1 && val <= maxQuantity) {
                      setQuantity(val);
                    }
                  }}
                  className="w-20 text-center px-3 py-2 bg-cream-50 border border-cream-600 text-brown-800 focus:outline-none focus:border-orange-500"
                />
                <button
                  onClick={() => setQuantity(q => Math.min(maxQuantity, q + 1))}
                  disabled={quantity >= maxQuantity}
                  className="bg-cream-300 hover:bg-cream-400 disabled:opacity-50 w-10 h-10 flex items-center justify-center text-brown-800 text-xl cursor-pointer transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            <div className="bg-cream-200 border border-cream-400 p-4">
              <div className="flex justify-between text-brown-800 text-sm mb-1">
                <span>{item.bitsCost.toLocaleString()} bits &times; {quantity}</span>
                <span className="font-bold">{totalCost.toLocaleString()} bits</span>
              </div>
              <div className="flex justify-between text-brown-800 text-sm">
                <span>Flight stipend added</span>
                <span className="font-bold text-orange-500">${(quantity * 10).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {!showQuantity && (
          <div className="mb-6 bg-cream-200 border border-cream-400 p-4">
            <div className="flex justify-between text-brown-800 text-sm">
              <span>Cost</span>
              <span className="font-bold">{totalCost.toLocaleString()} bits</span>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={purchasing}
            className="flex-1 bg-cream-300 hover:bg-cream-400 px-6 py-3 text-center cursor-pointer transition-colors disabled:opacity-50"
          >
            <span className="text-brown-800 uppercase tracking-wide text-sm font-bold">Cancel</span>
          </button>
          <button
            onClick={() => onConfirm(item.id, quantity)}
            disabled={purchasing || totalCost > bitsBalance}
            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 px-6 py-3 text-center cursor-pointer transition-colors"
          >
            <span className="text-cream-100 uppercase tracking-wide text-sm font-bold">
              {purchasing ? 'Buying...' : 'Confirm'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShopPage() {
  const { data: session } = useSession();
  const [bitsBalance, setBitsBalance] = useState<number>(0);
  const [bitsEarned, setBitsEarned] = useState<number>(0);
  const [bitsSpent, setBitsSpent] = useState<number>(0);
  const [purchasedItems, setPurchasedItems] = useState<Set<string>>(new Set());
  const [itemTotals, setItemTotals] = useState<Record<string, number>>({});
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const openConfirmModal = (itemId: string) => {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;
    setError(null);
    setConfirmModal({ item, quantity: 1 });
  };

  const handlePurchase = async (itemId: string, quantity: number) => {
    setPurchasing(itemId);
    try {
      const res = await fetch('/api/shop/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, quantity }),
      });
      if (res.ok) {
        const { newBalance, bitsSpent: cost } = await res.json();
        setBitsBalance(newBalance);
        setPurchasedItems(prev => new Set(prev).add(itemId));
        setItemTotals(prev => ({
          ...prev,
          [itemId]: (prev[itemId] ?? 0) + cost,
        }));
        setConfirmModal(null);
      } else {
        const { error } = await res.json();
        setError(error || 'Purchase failed');
        setConfirmModal(null);
      }
    } catch {
      setError('Purchase failed');
      setConfirmModal(null);
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
            <h2 className="text-orange-500 text-lg uppercase tracking-wide">Your Bits Balance</h2>
            <p className="text-brown-800 text-4xl font-bold">{bitsBalance.toLocaleString()} Bits</p>
          </div>
          <div className="text-right">
            <p className="text-brown-800 text-xs uppercase tracking-wide">Earned</p>
            <p className="text-brown-800 text-lg">{bitsEarned.toLocaleString()} bits</p>
            <p className="text-brown-800 text-xs uppercase tracking-wide mt-1">Spent on Parts</p>
            <p className="text-brown-800 text-lg">{bitsSpent.toLocaleString()} bits</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-cream-100 border-2 border-orange-500 p-4">
          <p className="text-orange-500 text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center">
          <p className="text-brown-800">Loading shop...</p>
        </div>
      ) : (
        <>
          {/* Event Invite + Flight Stipend - side by side */}
          {(inviteItem || flightItem) && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {inviteItem && (
                  <div>
                    <h2 className="text-orange-500 text-xl uppercase tracking-wide mb-4">Event Invite</h2>
                    <div className={`bg-cream-100 border-2 p-6 flex flex-col gap-4 h-[calc(100%-3.5rem)] ${
                      purchasedItems.has(inviteItem.id) || bitsBalance >= inviteItem.bitsCost ? 'border-orange-500' : 'border-cream-400'
                    }`}>
                      <div className="flex-1">
                        <h3 className="text-brown-800 text-xl font-medium mb-1">{inviteItem.name}</h3>
                        <p className="text-brown-800 text-sm mb-3">{inviteItem.description}</p>
                        <p className="text-orange-400 font-bold text-lg">{inviteItem.bitsCost.toLocaleString()} Bits</p>
                      </div>
                      <div>
                        {purchasedItems.has(inviteItem.id) ? (
                          <div className="bg-orange-500/20 border border-orange-500/50 px-6 py-3 text-center">
                            <span className="text-orange-400 uppercase tracking-wide text-sm font-bold">Purchased!</span>
                          </div>
                        ) : bitsBalance >= inviteItem.bitsCost ? (
                          <button
                            onClick={() => openConfirmModal(inviteItem.id)}
                            disabled={purchasing === inviteItem.id}
                            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 px-6 py-3 text-center w-full cursor-pointer transition-colors"
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
                )}

                {flightItem && (
                  <div>
                    <h2 className="text-orange-500 text-xl uppercase tracking-wide mb-4">Flight Stipend</h2>
                    <div className={`bg-cream-100 border-2 p-6 flex flex-col gap-4 h-[calc(100%-3.5rem)] ${
                      !hasEventInvite ? 'border-cream-300 opacity-60' : bitsBalance >= flightItem.bitsCost ? 'border-orange-500' : 'border-cream-400'
                    }`}>
                      <div className="flex-1">
                        <h3 className="text-brown-800 text-xl font-medium mb-1">{flightItem.name}</h3>
                        <p className="text-brown-800 text-sm mb-3">{flightItem.description}</p>
                        <p className="text-orange-400 font-bold text-lg">{flightItem.bitsCost.toLocaleString()} Bits per $10</p>
                        {(itemTotals[flightItem.id] ?? 0) > 0 && (
                          <p className="text-brown-800 text-sm mt-2">
                            You&apos;ve put <span className="font-bold text-orange-400">${(itemTotals[flightItem.id] ?? 0).toLocaleString()}</span> toward your flight so far
                          </p>
                        )}
                      </div>
                      <div>
                        {!hasEventInvite ? (
                          <div className="bg-cream-300 px-6 py-3 text-center">
                            <span className="text-cream-600 uppercase tracking-wide text-sm">
                              Buy Event Invite first
                            </span>
                          </div>
                        ) : bitsBalance >= flightItem.bitsCost ? (
                          <button
                            onClick={() => openConfirmModal(flightItem.id)}
                            disabled={purchasing === flightItem.id}
                            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 px-6 py-3 text-center w-full cursor-pointer transition-colors"
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
                )}
              </div>
            </div>
          )}

          {/* Other Items */}
          <div>
            <h2 className="text-orange-500 text-xl uppercase tracking-wide mb-4">Other Items</h2>
            <div className="bg-cream-100 border-2 border-cream-400 p-6 text-center">
              <p className="text-cream-500 uppercase tracking-wide text-sm">Coming soon...</p>
            </div>
          </div>
        </>
      )}

      {confirmModal && (
        <PurchaseConfirmModal
          item={confirmModal.item}
          initialQuantity={confirmModal.quantity}
          bitsBalance={bitsBalance}
          onConfirm={handlePurchase}
          onClose={() => setConfirmModal(null)}
          purchasing={purchasing !== null}
        />
      )}
    </div>
  );
}
