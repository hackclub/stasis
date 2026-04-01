'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from '@/lib/auth-client';
import { ItemCard } from '@/app/components/inventory/ItemCard';
import { ToolCard } from '@/app/components/inventory/ToolCard';
import { CartPanel } from '@/app/components/inventory/CartPanel';
import { CheckoutModal } from '@/app/components/inventory/CheckoutModal';
import { RentalTimer } from '@/app/components/inventory/RentalTimer';
import { useInventoryAccess } from './InventoryAccessContext';

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

interface Tool {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  available: boolean;
}

interface CartItem {
  itemId: string;
  name: string;
  quantity: number;
}

interface CartTool {
  toolId: string;
  name: string;
}

interface Order {
  id: string;
  status: string;
}

interface Rental {
  id: string;
  status: 'CHECKED_OUT' | 'RETURNED';
  floor: number;
  location: string;
  dueAt: string | null;
  tool: { id: string; name: string };
  rentedBy: { id: string; name: string; email: string };
}

const DEFAULT_MAX_CONCURRENT_RENTALS = 2;
const DEFAULT_VENUE_FLOORS = 3;

export default function BrowsePage() {
  const { data: session } = useSession();
  const access = useInventoryAccess();

  // Items
  const [items, setItems] = useState<Item[]>([]);
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('inventory-cart-items') || '[]'); } catch { return []; }
  });
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasActiveOrder, setHasActiveOrder] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Tools
  const [tools, setTools] = useState<Tool[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [maxRentals, setMaxRentals] = useState(DEFAULT_MAX_CONCURRENT_RENTALS);

  // Unified cart for tools
  const [cartTools, setCartTools] = useState<CartTool[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('inventory-cart-tools') || '[]'); } catch { return []; }
  });

  // Persist cart to localStorage
  useEffect(() => { localStorage.setItem('inventory-cart-items', JSON.stringify(cart)); }, [cart]);
  useEffect(() => { localStorage.setItem('inventory-cart-tools', JSON.stringify(cartTools)); }, [cartTools]);

  // Unified checkout
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const activeRentals = rentals.filter(r => r.status === 'CHECKED_OUT');

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/items');
      if (!res.ok) throw new Error('Failed to load items');
      setItems(await res.json());
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
      setHasActiveOrder(orders.some(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED'));
    } catch {}
  }, []);

  const fetchTools = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/tools');
      if (!res.ok) throw new Error('Failed to load tools');
      setTools(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tools');
    }
  }, []);

  const fetchRentals = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/rentals');
      if (!res.ok) return;
      setRentals(await res.json());
    } catch {}
  }, []);

  const venueFloors = access?.venueFloors ?? DEFAULT_VENUE_FLOORS;
  const allowMultipleOrders = access?.allowMultipleOrders ?? false;

  useEffect(() => {
    if (access?.maxConcurrentRentals) setMaxRentals(access.maxConcurrentRentals);
  }, [access?.maxConcurrentRentals]);

  useEffect(() => {
    if (!session) return;
    Promise.all([
      fetchItems(),
      checkActiveOrder(),
      fetchTools(),
      fetchRentals(),
    ]).finally(() => setToolsLoading(false));
  }, [session, fetchItems, checkActiveOrder, fetchTools, fetchRentals]);

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
        return prev.map(c => c.itemId === itemId ? { ...c, quantity: c.quantity + quantity } : c);
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

  const addToolToCart = (toolId: string) => {
    const tool = tools.find(t => t.id === toolId);
    if (!tool) return;
    if (cartTools.some(t => t.toolId === toolId)) return; // already in cart
    setCartTools(prev => [...prev, { toolId, name: tool.name }]);
  };

  const removeToolFromCart = (toolId: string) => {
    setCartTools(prev => prev.filter(t => t.toolId !== toolId));
  };

  const handleCheckout = async (floor: number, location: string) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const results: string[] = [];

      // Place parts order
      if (cart.length > 0) {
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
        results.push('Parts order placed');
        setHasActiveOrder(true);
      }

      // Create tool rentals
      const failedRentalIds: Set<string> = new Set();
      const failedRentalNames: string[] = [];
      if (cartTools.length > 0) {
        const rentalOutcomes = await Promise.allSettled(
          cartTools.map(async (tool) => {
            const res = await fetch('/api/inventory/rentals', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ toolId: tool.toolId, floor, location }),
            });
            if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error || `Failed to rent ${tool.name}`);
            }
            return { name: tool.name, toolId: tool.toolId };
          })
        );
        for (let i = 0; i < rentalOutcomes.length; i++) {
          const outcome = rentalOutcomes[i];
          if (outcome.status === 'fulfilled') {
            results.push(`${outcome.value.name} rented`);
          } else {
            failedRentalIds.add(cartTools[i].toolId);
            failedRentalNames.push(cartTools[i].name);
          }
        }
      }

      setCart([]);
      setCartTools(prev => prev.filter(t => failedRentalIds.has(t.toolId)));
      setCheckoutOpen(false);

      if (failedRentalNames.length > 0 && results.length > 0) {
        setSuccessMessage(results.join('. ') + '. Check Team Home for status.');
        setError(`Failed to rent: ${failedRentalNames.join(', ')}`);
      } else if (failedRentalNames.length > 0) {
        setError(`Failed to rent: ${failedRentalNames.join(', ')}`);
      } else {
        setSuccessMessage(results.join('. ') + '. Check Team Home for status.');
      }

      fetchItems();
      fetchTools();
      fetchRentals();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canRentMore = activeRentals.length + cartTools.length < maxRentals;
  const cartTotal = cart.reduce((s, c) => s + c.quantity, 0) + cartTools.length;

  if (loading && toolsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div>
      {successMessage && (
        <div className="mb-6 border-2 border-green-600 bg-green-50 px-4 py-3 text-green-800 text-sm">
          {successMessage}
        </div>
      )}
      {error && !checkoutOpen && (
        <div className="mb-6 border-2 border-red-600 bg-red-50 px-4 py-3 text-red-800 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline cursor-pointer">Dismiss</button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 space-y-10">
          <section>
            <h2 className="text-brown-800 font-bold text-lg uppercase tracking-wide mb-4">Parts</h2>

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

            {filteredItems.length === 0 ? (
              <p className="text-brown-800/50 text-sm">No items found.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredItems.map(item => (
                  <ItemCard key={item.id} item={item} cartQuantity={cart.find(c => c.itemId === item.id)?.quantity ?? 0} onAdd={addToCart} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-brown-800 font-bold text-lg uppercase tracking-wide mb-4">Tools</h2>

            {activeRentals.length > 0 && (
              <div className="mb-6">
                <p className="text-brown-800/60 text-xs uppercase tracking-wider mb-3">
                  Active Rentals ({activeRentals.length} / {maxRentals})
                </p>
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

            {tools.length === 0 ? (
              <p className="text-brown-800/50 text-sm">No tools available.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {tools.map(tool => {
                  const inCart = cartTools.some(t => t.toolId === tool.id);
                  return (
                    <ToolCard
                      key={tool.id}
                      tool={tool}
                      onRent={addToolToCart}
                      inCart={inCart}
                      canRent={canRentMore}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="hidden lg:block w-80 shrink-0">
          <div className="sticky top-8">
            <CartPanel
              items={cart}
              tools={cartTools}
              onUpdateQuantity={updateQuantity}
              onRemoveItem={removeFromCart}
              onRemoveTool={removeToolFromCart}
              onCheckout={() => { setError(null); setCheckoutOpen(true); }}
              disabled={!allowMultipleOrders && hasActiveOrder && cart.length > 0}
              hasActiveOrder={!allowMultipleOrders && hasActiveOrder}
            />
          </div>
        </div>

        <div className="lg:hidden fixed bottom-4 right-4 z-40">
          {!cartOpen && (
            <button
              onClick={() => setCartOpen(true)}
              className="px-4 py-3 bg-orange-500 border-2 border-brown-800 text-cream-50 text-sm uppercase tracking-wider shadow-lg cursor-pointer"
            >
              Cart ({cartTotal})
            </button>
          )}
        </div>

        {cartOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
            <div className="absolute inset-0 bg-[#3D3229]/80" onClick={() => setCartOpen(false)} />
            <div className="relative max-h-[70vh] overflow-y-auto">
              <CartPanel
                items={cart}
                tools={cartTools}
                onUpdateQuantity={updateQuantity}
                onRemoveItem={removeFromCart}
                onRemoveTool={removeToolFromCart}
                onCheckout={() => {
                  setCartOpen(false);
                  setError(null); setCheckoutOpen(true);
                }}
                disabled={!allowMultipleOrders && hasActiveOrder && cart.length > 0}
                hasActiveOrder={!allowMultipleOrders && hasActiveOrder}
              />
            </div>
          </div>
        )}
      </div>

      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => { setCheckoutOpen(false); setError(null); }}
        items={cart}
        tools={cartTools}
        onConfirm={handleCheckout}
        isSubmitting={isSubmitting}
        venueFloors={venueFloors}
        error={error}
      />
    </div>
  );
}
