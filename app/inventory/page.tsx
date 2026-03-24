'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from '@/lib/auth-client';
import { ItemCard } from '@/app/components/inventory/ItemCard';
import { CartPanel } from '@/app/components/inventory/CartPanel';
import { CheckoutModal } from '@/app/components/inventory/CheckoutModal';

interface Item {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  stock: number;
  category: string;
  maxPerTeam: number;
  teamUsed: number;
}

interface CartItem {
  itemId: string;
  name: string;
  quantity: number;
}

interface Order {
  id: string;
  status: string;
}

export default function BrowsePartsPage() {
  const { data: session } = useSession();
  const [items, setItems] = useState<Item[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasActiveOrder, setHasActiveOrder] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/items');
      if (!res.ok) throw new Error('Failed to load items');
      const data = await res.json();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load items');
    } finally {
      setLoading(false);
    }
  }, []);

  const checkActiveOrder = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/orders');
      if (!res.ok) return;
      const orders: Order[] = await res.json();
      setHasActiveOrder(orders.some(o => o.status !== 'COMPLETED'));
    } catch {
      // Ignore - user might not be on a team yet
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchItems();
    checkActiveOrder();
  }, [session, fetchItems, checkActiveOrder]);

  const categories = Array.from(new Set(items.map(i => i.category))).sort();
  const filteredItems = activeCategory
    ? items.filter(i => i.category === activeCategory)
    : items;

  const addToCart = (itemId: string, quantity: number) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    setCart(prev => {
      const existing = prev.find(c => c.itemId === itemId);
      if (existing) {
        return prev.map(c =>
          c.itemId === itemId ? { ...c, quantity: c.quantity + quantity } : c
        );
      }
      return [...prev, { itemId, name: item.name, quantity }];
    });
  };

  const updateQuantity = (itemId: string, qty: number) => {
    if (qty <= 0) {
      setCart(prev => prev.filter(c => c.itemId !== itemId));
    } else {
      setCart(prev => prev.map(c => (c.itemId === itemId ? { ...c, quantity: qty } : c)));
    }
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(c => c.itemId !== itemId));
  };

  const handleCheckout = async (floor: number, location: string) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/inventory/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(c => ({ itemId: c.itemId, quantity: c.quantity })),
          floor,
          location,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to place order');
      }

      setCart([]);
      setCheckoutOpen(false);
      setSuccessMessage('Order placed successfully! Check your dashboard for status updates.');
      setHasActiveOrder(true);
      fetchItems();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place order');
    } finally {
      setIsSubmitting(false);
    }
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

      {/* Active order banner */}
      {hasActiveOrder && (
        <div className="mb-6 border-2 border-orange-500 bg-orange-500/10 px-4 py-3 text-brown-800 text-sm">
          Your team has an active order. You cannot place another order until it is completed.
        </div>
      )}

      {/* Category filters */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-3 py-1 text-xs uppercase tracking-wider border-2 transition-colors cursor-pointer ${
              activeCategory === null
                ? 'border-brown-800 bg-brown-800 text-cream-50'
                : 'border-brown-800 text-brown-800 hover:bg-cream-200'
            }`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 text-xs uppercase tracking-wider border-2 transition-colors cursor-pointer ${
                activeCategory === cat
                  ? 'border-brown-800 bg-brown-800 text-cream-50'
                  : 'border-brown-800 text-brown-800 hover:bg-cream-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Items grid */}
        <div className="flex-1">
          {filteredItems.length === 0 ? (
            <p className="text-brown-800/50 text-sm">No items found.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredItems.map(item => (
                <ItemCard key={item.id} item={item} onAdd={addToCart} />
              ))}
            </div>
          )}
        </div>

        {/* Cart - desktop sidebar */}
        <div className="hidden lg:block w-80 shrink-0">
          <div className="sticky top-8">
            <CartPanel
              items={cart}
              onUpdateQuantity={updateQuantity}
              onRemove={removeFromCart}
              onCheckout={() => setCheckoutOpen(true)}
              disabled={hasActiveOrder}
            />
          </div>
        </div>

        {/* Cart - mobile toggle */}
        <div className="lg:hidden fixed bottom-4 right-4 z-40">
          {!cartOpen && (
            <button
              onClick={() => setCartOpen(true)}
              className="px-4 py-3 bg-orange-500 border-2 border-brown-800 text-cream-50 text-sm uppercase tracking-wider shadow-lg cursor-pointer"
            >
              Cart ({cart.reduce((s, c) => s + c.quantity, 0)})
            </button>
          )}
        </div>

        {cartOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
            <div className="absolute inset-0 bg-[#3D3229]/80" onClick={() => setCartOpen(false)} />
            <div className="relative max-h-[70vh] overflow-y-auto">
              <CartPanel
                items={cart}
                onUpdateQuantity={updateQuantity}
                onRemove={removeFromCart}
                onCheckout={() => {
                  setCartOpen(false);
                  setCheckoutOpen(true);
                }}
                disabled={hasActiveOrder}
              />
            </div>
          </div>
        )}
      </div>

      {/* Checkout modal */}
      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        items={cart}
        onConfirm={handleCheckout}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
