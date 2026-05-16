'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSession } from '@/lib/auth-client';
import { ItemCard } from '@/app/components/inventory/ItemCard';
import { ToolCard } from '@/app/components/inventory/ToolCard';
import { CartPanel } from '@/app/components/inventory/CartPanel';
import { CheckoutModal } from '@/app/components/inventory/CheckoutModal';
import { RentalTimer } from '@/app/components/inventory/RentalTimer';
import { minutesToHuman } from '@/app/components/inventory/manufacturing/ManufacturingUI';
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

interface ToolGroup {
  key: string;
  name: string;
  description?: string;
  imageUrl?: string;
  tools: Tool[];
  availableCount: number;
  totalCount: number;
  selectedCount: number;
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

interface CartPrint {
  cartId: string;
  projectName: string;
  description: string;
  material: string;
  colour: string;
  fileLink?: string;
  notes?: string;
  urgent: boolean;
}

interface Order {
  id: string;
  status: string;
}

interface Rental {
  id: string;
  status: 'PLACED' | 'IN_PROGRESS' | 'READY' | 'CHECKED_OUT' | 'RETURN_REQUESTED' | 'RETURNED' | 'CANCELLED';
  floor: number;
  location: string;
  dueAt: string | null;
  tool: { id: string; name: string };
  rentedBy: { id: string; name: string; email: string };
}

const DEFAULT_MAX_CONCURRENT_RENTALS = 2;
const DEFAULT_VENUE_FLOORS = 3;
const TOOL_REQUEST_STATUSES = ['PLACED', 'IN_PROGRESS', 'READY', 'CHECKED_OUT'] as const;
const OPEN_RENTAL_STATUSES = ['PLACED', 'IN_PROGRESS', 'READY', 'CHECKED_OUT', 'RETURN_REQUESTED'] as const;

export default function BrowsePage() {
  const { data: session } = useSession();
  const access = useInventoryAccess();

  // Items
  const [items, setItems] = useState<Item[]>([]);
  const [activeBrowseTab, setActiveBrowseTab] = useState<'PARTS' | 'TOOLS' | 'PRINTS'>('PARTS');
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
  const [cartPrints, setCartPrints] = useState<CartPrint[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('inventory-cart-prints') || '[]'); } catch { return []; }
  });
  const [printModalOpen, setPrintModalOpen] = useState(false);

  // Persist cart to localStorage
  useEffect(() => { localStorage.setItem('inventory-cart-items', JSON.stringify(cart)); }, [cart]);
  useEffect(() => { localStorage.setItem('inventory-cart-tools', JSON.stringify(cartTools)); }, [cartTools]);
  useEffect(() => { localStorage.setItem('inventory-cart-prints', JSON.stringify(cartPrints)); }, [cartPrints]);

  // Unified checkout
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const activeRentals = rentals.filter(r => TOOL_REQUEST_STATUSES.includes(r.status as typeof TOOL_REQUEST_STATUSES[number]));
  const activeReturns = rentals.filter(r => r.status === 'RETURN_REQUESTED');
  const openRentals = rentals.filter(r => OPEN_RENTAL_STATUSES.includes(r.status as typeof OPEN_RENTAL_STATUSES[number]));

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

  const removeToolFromCart = (toolId: string) => {
    setCartTools(prev => prev.filter(t => t.toolId !== toolId));
  };

  const addPrintToCart = (print: Omit<CartPrint, 'cartId'>) => {
    const newId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `print-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setCartPrints(prev => [...prev, { ...print, cartId: newId }]);
    setPrintModalOpen(false);
  };

  const removePrintFromCart = (cartId: string) => {
    setCartPrints(prev => prev.filter(print => print.cartId !== cartId));
  };

  const toolGroups = useMemo<ToolGroup[]>(() => {
    const cartToolIds = new Set(cartTools.map(t => t.toolId));
    const groups = new Map<string, Omit<ToolGroup, 'availableCount' | 'totalCount' | 'selectedCount'>>();

    for (const tool of tools) {
      const key = tool.name.trim().toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.tools.push(tool);
        if (!existing.description && tool.description) existing.description = tool.description;
        if (!existing.imageUrl && tool.imageUrl) existing.imageUrl = tool.imageUrl;
      } else {
        groups.set(key, {
          key,
          name: tool.name,
          description: tool.description,
          imageUrl: tool.imageUrl,
          tools: [tool],
        });
      }
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        availableCount: group.tools.filter(t => t.available).length,
        totalCount: group.tools.length,
        selectedCount: group.tools.filter(t => cartToolIds.has(t.id)).length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tools, cartTools]);

  const addToolGroupToCart = (groupKey: string) => {
    setCartTools(prev => {
      const taken = new Set(prev.map(t => t.toolId));
      const group = toolGroups.find(g => g.key === groupKey);
      const tool = group?.tools.find(t => t.available && !taken.has(t.id));
      if (!tool) return prev;
      return [...prev, { toolId: tool.id, name: tool.name }];
    });
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
      const failedMessages: string[] = [];
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
            results.push(`${outcome.value.name} tool request placed`);
          } else {
            failedRentalIds.add(cartTools[i].toolId);
            failedRentalNames.push(cartTools[i].name);
            failedMessages.push(outcome.reason instanceof Error ? outcome.reason.message : `Failed to rent ${cartTools[i].name}`);
          }
        }
      }

      const failedPrintIds: Set<string> = new Set();
      const failedPrintNames: string[] = [];
      if (cartPrints.length > 0) {
        const printOutcomes = await Promise.allSettled(
          cartPrints.map(async (print) => {
            const res = await fetch('/api/inventory/manufacturing/jobs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                projectName: print.projectName,
                description: print.description,
                material: print.material,
                colour: print.colour,
                fileLink: print.fileLink,
                notes: print.notes,
                urgent: print.urgent,
              }),
            });
            if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error || `Failed to request ${print.projectName}`);
            }
            return { cartId: print.cartId, projectName: print.projectName };
          })
        );
        for (let i = 0; i < printOutcomes.length; i++) {
          const outcome = printOutcomes[i];
          if (outcome.status === 'fulfilled') {
            results.push(`${outcome.value.projectName} print requested`);
          } else {
            failedPrintIds.add(cartPrints[i].cartId);
            failedPrintNames.push(cartPrints[i].projectName);
            failedMessages.push(outcome.reason instanceof Error ? outcome.reason.message : `Failed to request ${cartPrints[i].projectName}`);
          }
        }
      }

      setCart([]);
      setCartTools(prev => prev.filter(t => failedRentalIds.has(t.toolId)));
      setCartPrints(prev => prev.filter(print => failedPrintIds.has(print.cartId)));
      setCheckoutOpen(false);

      const failedNames = [...failedRentalNames, ...failedPrintNames];
      if (failedNames.length > 0 && results.length > 0) {
        setSuccessMessage(results.join('. ') + '. Check Team Home for status.');
        setError(`Failed: ${failedMessages.join(' ') || failedNames.join(', ')}`);
      } else if (failedNames.length > 0) {
        setError(`Failed: ${failedMessages.join(' ') || failedNames.join(', ')}`);
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

  const canRentMore = openRentals.length + cartTools.length < maxRentals;
  const cartTotal = cart.reduce((s, c) => s + c.quantity, 0) + cartTools.length + cartPrints.length;

  if (loading || toolsLoading) {
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
          <div className="flex flex-wrap gap-2">
            {(['PARTS', 'TOOLS', 'PRINTS'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveBrowseTab(tab)}
                className={`px-3 py-1 text-xs uppercase tracking-wider border-2 transition-colors ${
                  activeBrowseTab === tab
                    ? 'border-brown-800 bg-brown-800 text-cream-50'
                    : 'border-brown-800 text-brown-800 hover:bg-cream-200'
                }`}
              >
                {tab === 'PRINTS' ? 'Print' : tab.toLowerCase()}
              </button>
            ))}
          </div>

          {activeBrowseTab === 'PARTS' && (
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
          )}

          {activeBrowseTab === 'TOOLS' && (
          <section>
            <h2 className="text-brown-800 font-bold text-lg uppercase tracking-wide mb-4">Tools</h2>

            {activeRentals.length > 0 && (
              <div className="mb-6">
                <p className="text-brown-800/60 text-xs uppercase tracking-wider mb-3">
                  Tool Requests ({activeRentals.length} / {maxRentals})
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
                        <span className="text-brown-800/50 text-xs ml-2 uppercase">
                          {rental.status.replace('_', ' ')}
                        </span>
                      </div>
                      {rental.status === 'CHECKED_OUT' && <RentalTimer dueAt={rental.dueAt} />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeReturns.length > 0 && (
              <div className="mb-6">
                <p className="text-brown-800/60 text-xs uppercase tracking-wider mb-3">
                  Tool Returns ({activeReturns.length})
                </p>
                <div className="space-y-3">
                  {activeReturns.map(rental => (
                    <div
                      key={rental.id}
                      className="border-2 border-orange-500 bg-orange-500/10 p-4"
                    >
                      <div>
                        <span className="text-brown-800 font-bold text-sm">{rental.tool.name}</span>
                        <span className="text-brown-800/50 text-xs ml-2">
                          Floor {rental.floor} - {rental.location}
                        </span>
                        <span className="text-brown-800/50 text-xs ml-2 uppercase">
                          return waiting for organizer approval
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {toolGroups.length === 0 ? (
              <p className="text-brown-800/50 text-sm">No tools available.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {toolGroups.map(tool => (
                  <ToolCard
                    key={tool.key}
                    tool={tool}
                    onRent={() => addToolGroupToCart(tool.key)}
                    canRent={canRentMore}
                  />
                ))}
              </div>
            )}
          </section>
          )}

          {activeBrowseTab === 'PRINTS' && (
          <section>
            <h2 className="text-brown-800 font-bold text-lg uppercase tracking-wide mb-4">Print</h2>
            <div className="border-2 border-brown-800 bg-cream-100 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-brown-800 font-bold text-sm uppercase tracking-wide">3D Print Request</h3>
                  <p className="text-brown-800/60 text-sm mt-1">Add a print request to checkout. Organizers review and run the printers.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPrintModalOpen(true)}
                  className="w-12 h-12 border-2 border-brown-800 bg-orange-500 text-cream-50 text-3xl leading-none hover:bg-orange-600 transition-colors"
                  aria-label="Add print request"
                >
                  +
                </button>
              </div>
            </div>
          </section>
          )}
        </div>

        <div className="hidden lg:block w-80 shrink-0">
          <div className="sticky top-8">
            <CartPanel
              items={cart}
              tools={cartTools}
              prints={cartPrints}
              onUpdateQuantity={updateQuantity}
              onRemoveItem={removeFromCart}
              onRemoveTool={removeToolFromCart}
              onRemovePrint={removePrintFromCart}
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
                prints={cartPrints}
                onUpdateQuantity={updateQuantity}
                onRemoveItem={removeFromCart}
                onRemoveTool={removeToolFromCart}
                onRemovePrint={removePrintFromCart}
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
        prints={cartPrints}
        onConfirm={handleCheckout}
        isSubmitting={isSubmitting}
        venueFloors={venueFloors}
        error={error}
      />
      <PrintRequestModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        onAdd={addPrintToCart}
      />
    </div>
  );
}

function PrintRequestModal({
  isOpen,
  onClose,
  onAdd,
}: Readonly<{
  isOpen: boolean;
  onClose: () => void;
  onAdd: (print: Omit<CartPrint, 'cartId'>) => void;
}>) {
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [material, setMaterial] = useState('PLA');
  const [colour, setColour] = useState('Any');
  const [fileLink, setFileLink] = useState('');
  const [notes, setNotes] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [budget, setBudget] = useState<{ remaining: number; allowance: number; autoApprove: boolean } | null>(null);

  const resetForm = useCallback(() => {
    setProjectName('');
    setDescription('');
    setMaterial('PLA');
    setColour('Any');
    setFileLink('');
    setNotes('');
    setUrgent(false);
    setUnderstood(false);
    setBudget(null);
  }, []);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch('/api/inventory/manufacturing/state')
      .then((res) => res.ok ? res.json() : null)
      .then((state) => {
        if (cancelled || !state?.teams?.length) return;
        const team = state.teams[0];
        setBudget({
          remaining: Math.max(0, (team.allowanceMinutes ?? 0) - (team.usedMinutes ?? 0) - (team.reservedMinutes ?? 0)),
          allowance: team.allowanceMinutes ?? 0,
          autoApprove: Boolean(team.autoApprovePrints),
        });
      })
      .catch((error) => {
        console.error('Failed to load print budget', error);
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  const canAdd = projectName.trim() && description.trim() && understood;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center font-mono">
      <div className="absolute inset-0 bg-[#3D3229]/80" />
      <div className="relative bg-cream-100 border-2 border-brown-800 p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-brown-800 font-bold text-lg uppercase tracking-wide mb-6">Add Print Request</h2>

        <div className="space-y-4">
          <label className="block">
            <span className="block text-brown-800/70 text-xs uppercase mb-1">Project Name *</span>
            <input value={projectName} onChange={(e) => setProjectName(e.target.value)} className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800" />
          </label>
          <label className="block">
            <span className="block text-brown-800/70 text-xs uppercase mb-1">Short Description *</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full min-h-20 border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="block text-brown-800/70 text-xs uppercase mb-1">Material</span>
              <input value={material} onChange={(e) => setMaterial(e.target.value)} className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800" />
            </label>
            <label className="block">
              <span className="block text-brown-800/70 text-xs uppercase mb-1">Color</span>
              <input value={colour} onChange={(e) => setColour(e.target.value)} className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800" />
            </label>
          </div>
          <label className="block">
            <span className="block text-brown-800/70 text-xs uppercase mb-1">File Link</span>
            <input value={fileLink} onChange={(e) => setFileLink(e.target.value)} placeholder="Drive, Onshape, STL link, or organizer note" className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800 placeholder:text-brown-800/30" />
          </label>
          <label className="block">
            <span className="block text-brown-800/70 text-xs uppercase mb-1">Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full min-h-16 border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800" />
          </label>
          <label className={`block border-2 p-3 ${urgent ? 'border-red-700 bg-red-50 text-red-900' : 'border-brown-800 bg-cream-50 text-brown-800'}`}>
            <span className="flex items-start gap-2">
              <input type="checkbox" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} className="mt-1 h-4 w-4 accent-red-700" />
              <span>
                <span className="block text-xs font-bold uppercase tracking-wider">Urgent print</span>
                <span className="mt-1 block text-sm">
                  Use only for project-critical parts that block your build. Organizers will see this flag; random or non-critical urgent requests may be reprimanded.
                </span>
              </span>
            </span>
          </label>

          <div className="border-t border-brown-800 pt-4 text-sm text-brown-800/80">
            <p className="font-bold text-brown-800 uppercase text-xs tracking-wider mb-2">Before submitting</p>
            {budget && (
              <p className="mb-3 text-sm text-brown-800">
                Team print budget: <span className="font-bold">{minutesToHuman(budget.remaining)}</span> left of {minutesToHuman(budget.allowance)}.
              </p>
            )}
            <ul className="list-disc pl-5 space-y-1">
              <li>The part is required for the project.</li>
              <li>Organizers will estimate the print time before it reaches the printer queue.</li>
              <li>{budget?.autoApprove ? 'Your team allows organizers to move prints into the printer queue after estimating them; this will use your team budget.' : 'Your team must approve the estimated time from your budget before the print reaches the printer queue.'}</li>
              <li>The file link is accessible to organizers.</li>
              <li>Organizers may reject, delay, split, or reassign the print.</li>
              <li>Your team will collect the part when it is ready.</li>
            </ul>
            <label className="mt-4 flex items-start gap-2">
              <input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} className="mt-1 h-4 w-4 accent-orange-500" />
              <span>I understand.</span>
            </label>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={handleClose} className="flex-1 py-2 text-sm uppercase tracking-wider border-2 border-brown-800 text-brown-800 hover:bg-cream-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => {
              onAdd({
                projectName: projectName.trim(),
                description: description.trim(),
                material: material.trim() || 'PLA',
                colour: colour.trim() || 'Any',
                fileLink: fileLink.trim() || undefined,
                notes: notes.trim() || undefined,
                urgent,
              });
              resetForm();
            }}
            disabled={!canAdd}
            className="flex-1 py-2 text-sm uppercase tracking-wider border-2 border-brown-800 bg-orange-500 text-cream-50 hover:bg-orange-600 disabled:opacity-30 disabled:hover:bg-orange-500 transition-colors"
          >
            Add Request
          </button>
        </div>
      </div>
    </div>
  );
}
