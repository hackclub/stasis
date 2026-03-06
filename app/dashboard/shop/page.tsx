'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from "@/lib/auth-client";
import { SHOP_ITEMS } from '@/lib/shop';

interface DbShopItem {
  id: string;
  name: string;
  description: string;
  longDescription: string | null;
  imageUrl: string | null;
  price: number;
  maxPerUser: number;
}

interface PurchaseDetail {
  id: string;
  itemId: string;
  itemName: string;
  imageUrl: string | null;
  amount: number;
  purchasedAt: string;
}

interface PurchasableItem {
  id: string;
  name: string;
  bitsCost: number;
  category?: string;
  maxPerUser: number;
}

interface ConfirmModalState {
  item: PurchasableItem;
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
  item: PurchasableItem;
  initialQuantity: number;
  bitsBalance: number;
  onConfirm: (itemId: string, quantity: number) => void;
  onClose: () => void;
  purchasing: boolean;
}) {
  const [quantity, setQuantity] = useState(initialQuantity);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const showQuantity = item.category === 'flight_stipend';
  const totalCost = item.bitsCost * quantity;
  const maxQuantity = Math.floor(bitsBalance / item.bitsCost);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-[#3D3229]/80" onClick={onClose} />
      <div className="relative bg-cream-100 border-2 border-brown-800 p-8 max-w-md w-full mx-4 shadow-lg">
        <button
          onClick={onClose}
          className="absolute -top-4 -right-4 w-10 h-10 flex items-center justify-center bg-cream-100 border border-cream-600 text-brown-800 hover:text-orange-500 text-lg leading-none cursor-pointer transition-colors"
        >
          &times;
        </button>

        <h2 className="text-xl uppercase tracking-wide mb-2 text-brown-800">Confirm Purchase</h2>
        <p className="text-brown-800 mb-6">
          {showQuantity
            ? `Buy ${item.name} to put toward your flight?`
            : <>Spend <span className="text-orange-500 font-medium">{item.bitsCost.toLocaleString()}&nbsp;bits</span> on {item.name}?</>
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
                <span>{item.bitsCost.toLocaleString()}&nbsp;bits &times; {quantity}</span>
                <span className="font-bold">{totalCost.toLocaleString()}&nbsp;bits</span>
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
              <span className="font-bold">{totalCost.toLocaleString()}&nbsp;bits</span>
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

function HoldToBuyButton({ onComplete, disabled, price }: { onComplete: () => Promise<boolean>; disabled: boolean; price: number }) {
  const [filling, setFilling] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePointerDown = () => {
    if (disabled) return;
    setFilling(true);
    holdTimerRef.current = setTimeout(async () => {
      holdTimerRef.current = null;
      const success = await onComplete();
      if (!success) {
        setFilling(false);
      }
    }, 3000);
  };

  const handleRelease = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      setFilling(false);
    }
  };

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  const label = filling ? `Spending ${price.toLocaleString()} bits...` : 'Hold to Buy';

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerUp={handleRelease}
      onPointerLeave={handleRelease}
      onPointerCancel={handleRelease}
      disabled={disabled}
      className="relative w-full overflow-hidden border-2 border-orange-500 bg-cream-200 px-6 py-3 cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {/* Fill bar */}
      <div
        className="absolute inset-y-0 left-0 bg-orange-500 pointer-events-none"
        style={{
          width: filling ? '100%' : '0%',
          transition: filling ? 'width 3s linear' : 'width 0.3s ease-out',
        }}
      />
      {/* White text overlay — clipped to match fill progress */}
      <div
        className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
        style={{
          clipPath: filling ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)',
          transition: filling ? 'clip-path 3s linear' : 'clip-path 0.3s ease-out',
        }}
      >
        <span className="text-cream-100 uppercase tracking-wide text-sm font-bold">
          {label}
        </span>
      </div>
      {/* Orange text (visible on unfilled area) */}
      <span className="relative text-orange-500 uppercase tracking-wide text-sm font-bold">
        {label}
      </span>
    </button>
  );
}

function ItemDetailModal({
  item,
  bitsBalance,
  purchased,
  onPurchase,
  onClose,
}: {
  item: DbShopItem;
  bitsBalance: number;
  purchased: boolean;
  onPurchase: (itemId: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [animState, setAnimState] = useState<'idle' | 'purchasing' | 'fading' | 'flying' | 'done'>('idle');
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const canAfford = bitsBalance >= item.price;

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && animState === 'idle') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, animState]);

  const handleHoldComplete = async (): Promise<boolean> => {
    setAnimState('purchasing');
    setPurchaseError(null);
    const success = await onPurchase(item.id);
    if (success) {
      setAnimState('fading');
      setTimeout(() => {
        setAnimState('flying');
        setTimeout(() => {
          setAnimState('done');
          setTimeout(() => {
            onClose();
          }, 500);
        }, 700);
      }, 1000);
      return true;
    } else {
      setAnimState('idle');
      return false;
    }
  };

  const isAnimating = animState === 'fading' || animState === 'flying' || animState === 'done';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-[#3D3229]/80"
        onClick={animState === 'idle' ? onClose : undefined}
        style={{
          opacity: animState === 'done' ? 0 : 1,
          transition: animState === 'done' ? 'opacity 500ms ease' : 'none',
        }}
      />
      <div
        className="relative max-w-lg w-full mx-4 p-8 border-2"
        style={{
          backgroundColor: isAnimating ? 'transparent' : 'var(--color-cream-100)',
          borderColor: isAnimating ? 'transparent' : 'var(--color-brown-800)',
          boxShadow: isAnimating ? 'none' : '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
          transition: animState === 'flying' || animState === 'done'
            ? 'transform 700ms cubic-bezier(0.4, 0, 0.7, 0.2)'
            : animState !== 'idle'
              ? 'background-color 400ms ease, border-color 400ms ease, box-shadow 400ms ease'
              : 'none',
          transform: animState === 'flying' || animState === 'done' ? 'translateY(150vh)' : 'none',
        }}
      >
        {animState === 'idle' && (
          <button
            onClick={onClose}
            className="absolute -top-4 -right-4 w-10 h-10 flex items-center justify-center bg-cream-100 border border-cream-600 text-brown-800 hover:text-orange-500 text-lg leading-none cursor-pointer transition-colors"
          >
            &times;
          </button>
        )}

        {item.imageUrl && (
          <div
            className="aspect-video overflow-hidden mb-4"
            style={{
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: isAnimating ? 'transparent' : 'var(--color-cream-400)',
              backgroundColor: isAnimating ? 'transparent' : 'var(--color-cream-200)',
              transition: 'border-color 400ms ease, background-color 400ms ease',
            }}
          >
            <img src={item.imageUrl} alt="" className="w-full h-full object-contain" />
          </div>
        )}

        <div style={{ opacity: isAnimating ? 0 : 1, transition: 'opacity 400ms ease' }}>
          <h2 className="text-xl uppercase tracking-wide mb-2 text-brown-800">{item.name}</h2>
          <p className="text-brown-800 text-sm mb-2 whitespace-pre-wrap">{item.description}</p>
          {item.longDescription && (
            <p className="text-brown-800 text-sm mb-4 whitespace-pre-wrap">{item.longDescription}</p>
          )}
          {!item.longDescription && <div className="mb-2" />}
          <p className="text-orange-400 font-bold text-lg mb-6">{item.price.toLocaleString()}&nbsp;Bits</p>

          {purchaseError && (
            <p className="text-orange-500 text-sm mb-4">{purchaseError}</p>
          )}

          {purchased && item.maxPerUser > 0 ? (
            <div className="w-full bg-orange-500/20 border border-orange-500/50 px-6 py-3 text-center">
              <span className="text-orange-400 uppercase tracking-wide text-sm font-bold">Purchased!</span>
            </div>
          ) : canAfford ? (
            <HoldToBuyButton
              onComplete={handleHoldComplete}
              disabled={animState !== 'idle'}
              price={item.price}
            />
          ) : (
            <div className="w-full bg-cream-300 px-6 py-3 text-center">
              <span className="text-cream-600 uppercase tracking-wide text-sm">
                <span className="text-orange-500 font-medium">{(item.price - bitsBalance).toLocaleString()}&nbsp;bits</span> needed
              </span>
            </div>
          )}
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
  const [otherItems, setOtherItems] = useState<DbShopItem[]>([]);
  const [detailItem, setDetailItem] = useState<DbShopItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [purchases, setPurchases] = useState<PurchaseDetail[]>([]);
  const pendingBalanceRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [currencyRes, purchasesRes, itemsRes] = await Promise.all([
        fetch('/api/currency'),
        fetch('/api/shop/purchases'),
        fetch('/api/shop/items'),
      ]);
      if (currencyRes.ok) {
        const { bitsEarned, bomCost, bitsBalance } = await currencyRes.json();
        setBitsEarned(bitsEarned);
        setBitsSpent(bomCost ?? 0);
        setBitsBalance(bitsBalance);
      }
      if (purchasesRes.ok) {
        const { purchasedItemIds, itemTotals, purchases: purchaseList } = await purchasesRes.json();
        setPurchasedItems(new Set(purchasedItemIds));
        setItemTotals(itemTotals);
        setPurchases(purchaseList ?? []);
      }
      if (itemsRes.ok) {
        const { items } = await itemsRes.json();
        setOtherItems(items);
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

  const animateBitsCountdown = useCallback((from: number, to: number) => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    const duration = 1000;
    const startTime = performance.now();
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (to - from) * eased);
      setBitsBalance(current);
      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        animFrameRef.current = null;
      }
    };
    animFrameRef.current = requestAnimationFrame(animate);
  }, []);

  const flushPendingBalance = useCallback(() => {
    if (pendingBalanceRef.current !== null) {
      const newBalance = pendingBalanceRef.current;
      pendingBalanceRef.current = null;
      animateBitsCountdown(bitsBalance, newBalance);
    }
  }, [bitsBalance, animateBitsCountdown]);

  const openConfirmModal = (itemId: string) => {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;
    setError(null);
    setConfirmModal({ item, quantity: 1 });
  };

  const handleDbItemPurchase = async (itemId: string): Promise<boolean> => {
    setPurchasing(itemId);
    try {
      const res = await fetch('/api/shop/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, quantity: 1 }),
      });
      if (res.ok) {
        const { newBalance, bitsSpent: cost } = await res.json();
        pendingBalanceRef.current = newBalance;
        setPurchasedItems(prev => new Set(prev).add(itemId));
        setItemTotals(prev => ({
          ...prev,
          [itemId]: (prev[itemId] ?? 0) + cost,
        }));
        // Add to local purchases list
        const item = otherItems.find(i => i.id === itemId);
        if (item) {
          setPurchases(prev => [{
            id: Date.now().toString(),
            itemId,
            itemName: item.name,
            imageUrl: item.imageUrl,
            amount: cost,
            purchasedAt: new Date().toISOString(),
          }, ...prev]);
        }
        return true;
      } else {
        const { error } = await res.json();
        setError(error || 'Purchase failed');
        return false;
      }
    } catch {
      setError('Purchase failed');
      return false;
    } finally {
      setPurchasing(null);
    }
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
        setPurchasedItems(prev => new Set(prev).add(itemId));
        setItemTotals(prev => ({
          ...prev,
          [itemId]: (prev[itemId] ?? 0) + cost,
        }));
        // Add to local purchases list
        const shopItem = SHOP_ITEMS.find(i => i.id === itemId);
        if (shopItem) {
          for (let i = 0; i < quantity; i++) {
            setPurchases(prev => [{
              id: `${Date.now()}-${i}`,
              itemId,
              itemName: shopItem.name,
              imageUrl: null,
              amount: shopItem.bitsCost,
              purchasedAt: new Date().toISOString(),
            }, ...prev]);
          }
        }
        setConfirmModal(null);
        animateBitsCountdown(bitsBalance, newBalance);
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
            <p className="text-brown-800 text-4xl font-bold">{bitsBalance.toLocaleString()}&nbsp;Bits</p>
          </div>
          <div className="text-right">
            <p className="text-brown-800 text-xs uppercase tracking-wide">Earned</p>
            <p className="text-brown-800 text-lg">{bitsEarned.toLocaleString()}&nbsp;bits</p>
            <p className="text-brown-800 text-xs uppercase tracking-wide mt-1">Spent on Parts</p>
            <p className="text-brown-800 text-lg">{bitsSpent.toLocaleString()}&nbsp;bits</p>
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
              <h2 className="text-orange-500 text-xl uppercase tracking-wide mb-4">Event Invite</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {inviteItem && (
                  <div>
                    <div className={`bg-cream-100 border-2 p-6 flex flex-col gap-4 h-full ${
                      purchasedItems.has(inviteItem.id) || bitsBalance >= inviteItem.bitsCost ? 'border-orange-500' : 'border-cream-400'
                    }`}>
                      <div className="flex-1">
                        <h3 className="text-brown-800 text-xl font-medium mb-1">{inviteItem.name}</h3>
                        <p className="text-brown-800 text-sm mb-3">{inviteItem.description}</p>
                        <p className="text-orange-400 font-bold text-lg">{inviteItem.bitsCost.toLocaleString()}&nbsp;Bits</p>
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
                              <span className="text-orange-500 font-medium">{(inviteItem.bitsCost - bitsBalance).toLocaleString()}&nbsp;bits</span> needed
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {flightItem && (
                  <div>
                    <div className={`bg-cream-100 border-2 p-6 flex flex-col gap-4 h-full ${
                      !hasEventInvite ? 'border-cream-300 opacity-60' : bitsBalance >= flightItem.bitsCost ? 'border-orange-500' : 'border-cream-400'
                    }`}>
                      <div className="flex-1">
                        <h3 className="text-brown-800 text-xl font-medium mb-1">{flightItem.name}</h3>
                        <p className="text-brown-800 text-sm mb-3">{flightItem.description}</p>
                        <p className="text-orange-400 font-bold text-lg">{flightItem.bitsCost.toLocaleString()}&nbsp;Bits per $10</p>
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
                              <span className="text-orange-500 font-medium">{(flightItem.bitsCost - bitsBalance).toLocaleString()}&nbsp;bits</span> needed
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
            {otherItems.length === 0 ? (
              <div className="flex justify-center">
                <div className="bg-cream-100 border-2 border-cream-400 px-10 py-4">
                  <p className="text-cream-500 uppercase tracking-wide text-sm">Coming soon...</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {otherItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-cream-100 border-2 border-cream-400 cursor-pointer hover:border-orange-500 transition-colors"
                    onClick={() => setDetailItem(item)}
                  >
                    <div className="aspect-video overflow-hidden border-b border-cream-400 bg-cream-200 shop-item-image">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="w-full h-full object-contain relative z-[1]" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center relative z-[1]">
                          <span className="text-cream-500 text-sm uppercase tracking-wider">No image</span>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="text-brown-800 font-medium text-lg mb-1">{item.name}</h3>
                      <p className="text-brown-800 text-sm mb-2 line-clamp-2">{item.description}</p>
                      <p className="text-orange-400 font-bold">{item.price.toLocaleString()}&nbsp;Bits</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Purchases */}
          {purchases.length > 0 && (
          <div>
            <h2 className="text-orange-500 text-xl uppercase tracking-wide mb-4">Purchases</h2>
              <div className="bg-cream-100 border-2 border-cream-400 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-cream-400">
                      <th className="text-left text-brown-800 text-xs uppercase px-4 py-3">Item</th>
                      <th className="text-right text-brown-800 text-xs uppercase px-4 py-3">Bits Spent</th>
                      <th className="text-right text-brown-800 text-xs uppercase px-4 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((purchase) => (
                      <tr key={purchase.id} className="border-b border-cream-300 last:border-b-0">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {purchase.imageUrl && (
                              <img src={purchase.imageUrl} alt="" className="w-8 h-8 object-contain border border-cream-400 flex-shrink-0" />
                            )}
                            <span className="text-brown-800">{purchase.itemName}</span>
                          </div>
                        </td>
                        <td className="text-right px-4 py-3 text-orange-400 font-mono">
                          {purchase.amount.toLocaleString()}
                        </td>
                        <td className="text-right px-4 py-3 text-brown-800">
                          {new Date(purchase.purchasedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          </div>
          )}
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

      {detailItem && (
        <ItemDetailModal
          item={detailItem}
          bitsBalance={bitsBalance}
          purchased={purchasedItems.has(detailItem.id)}
          onPurchase={handleDbItemPurchase}
          onClose={() => {
            setDetailItem(null);
            flushPendingBalance();
          }}
        />
      )}
    </div>
  );
}
