'use client';

import { useState, useEffect, useCallback } from 'react';

interface PurchaseUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

interface Purchase {
  id: string;
  user: PurchaseUser;
  itemId: string;
  itemName: string;
  itemImageUrl: string | null;
  amount: number;
  createdAt: string;
  fulfilledAt: string | null;
}

interface ItemOption {
  id: string;
  name: string;
}

export default function AdminPurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters
  const [userFilter, setUserFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'unfulfilled' | 'fulfilled'>('');

  // Fulfill dialog
  const [fulfillTarget, setFulfillTarget] = useState<Purchase | null>(null);
  const [fulfilling, setFulfilling] = useState(false);

  // Debounced user filter for API calls
  const [debouncedUser, setDebouncedUser] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedUser(userFilter), 300);
    return () => clearTimeout(timer);
  }, [userFilter]);

  const fetchPurchases = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedUser) params.set('user', debouncedUser);
      if (itemFilter) params.set('itemId', itemFilter);
      if (statusFilter) params.set('status', statusFilter);
      const qs = params.toString();
      const res = await fetch(`/api/admin/purchases${qs ? `?${qs}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        setPurchases(data.purchases);
        setItemOptions(data.itemOptions);
      } else {
        setFetchError('Failed to load purchases.');
      }
    } catch {
      setFetchError('Network error — could not load purchases.');
    } finally {
      setLoading(false);
    }
  }, [debouncedUser, itemFilter, statusFilter]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleFulfill = async () => {
    if (!fulfillTarget) return;
    setFulfilling(true);
    try {
      const res = await fetch(`/api/admin/purchases/${fulfillTarget.id}/fulfill`, {
        method: 'PATCH',
      });
      if (res.ok) {
        setFulfillTarget(null);
        fetchPurchases();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(typeof data.error === 'string' ? data.error : 'Failed to fulfill purchase.');
      }
    } catch {
      alert('Failed to fulfill purchase.');
    } finally {
      setFulfilling(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-orange-500 text-2xl uppercase tracking-wide">Purchases</h1>
        <p className="text-cream-50 text-sm mt-1">
          All shop purchases.{!loading && ` Showing ${purchases.length} purchase${purchases.length !== 1 ? 's' : ''}.`}
        </p>
      </div>

      {/* Filters */}
      <div className="bg-brown-800 border-2 border-cream-500/20 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="text-cream-50 text-xs uppercase block mb-1">User (email or ID)</label>
            <input
              type="text"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              placeholder="user@example.com or cuid..."
              className="w-full bg-brown-900 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div className="sm:w-64">
            <label className="text-cream-50 text-xs uppercase block mb-1">Item</label>
            <select
              value={itemFilter}
              onChange={(e) => setItemFilter(e.target.value)}
              className="w-full bg-brown-900 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
            >
              <option value="">All items</option>
              {itemOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:w-48">
            <label className="text-cream-50 text-xs uppercase block mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | 'unfulfilled' | 'fulfilled')}
              className="w-full bg-brown-900 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
            >
              <option value="">All</option>
              <option value="unfulfilled">Unfulfilled</option>
              <option value="fulfilled">Fulfilled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Purchases table */}
      <div className="bg-brown-800 border-2 border-cream-500/20 overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center">
            <div className="flex items-center justify-center"><div className="loader" /></div>
          </div>
        ) : fetchError ? (
          <div className="p-8 text-center">
            <p className="text-red-600 text-sm">{fetchError}</p>
          </div>
        ) : purchases.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-cream-50">No purchases found.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-cream-500/20">
                <th className="text-left text-cream-50 text-xs uppercase px-4 py-3">User</th>
                <th className="text-left text-cream-50 text-xs uppercase px-4 py-3">Item</th>
                <th className="text-right text-cream-50 text-xs uppercase px-4 py-3">Bits</th>
                <th className="text-right text-cream-50 text-xs uppercase px-4 py-3">Date</th>
                <th className="text-center text-cream-50 text-xs uppercase px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} className="border-b border-cream-500/10 last:border-b-0 hover:bg-cream-500/5">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <img src={p.user.image || '/default_slack.png'} alt="" className="w-6 h-6 border border-cream-500/20" />
                      <div className="min-w-0">
                        <p className="text-cream-50 text-sm truncate">{p.user.name || p.user.email}</p>
                        {p.user.name && (
                          <p className="text-cream-200 text-xs truncate">{p.user.email}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {p.itemImageUrl && (
                        <img src={p.itemImageUrl} alt="" className="w-8 h-8 object-contain border border-cream-500/20" />
                      )}
                      <span className="text-cream-50">{p.itemName}</span>
                    </div>
                  </td>
                  <td className="text-right px-4 py-3 text-cream-50 font-mono">
                    {p.amount.toLocaleString()}
                  </td>
                  <td className="text-right px-4 py-3 text-cream-200 whitespace-nowrap">
                    {formatDate(p.createdAt)}
                  </td>
                  <td className="text-center px-4 py-3">
                    {p.fulfilledAt ? (
                      <span className="text-green-600 text-xs uppercase" title={formatDate(p.fulfilledAt)}>
                        Fulfilled
                      </span>
                    ) : (
                      <button
                        onClick={() => setFulfillTarget(p)}
                        className="px-3 py-1 text-xs uppercase bg-orange-500 hover:bg-orange-400 text-white transition-colors cursor-pointer"
                      >
                        Fulfill
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Fulfill Confirmation Dialog */}
      {fulfillTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-[#3D3229]/80" onClick={() => !fulfilling && setFulfillTarget(null)} />
          <div className="relative bg-brown-800 border-2 border-orange-500 p-6 max-w-md w-full mx-4 shadow-lg">
            <h2 className="text-orange-500 text-lg uppercase tracking-wide mb-4">
              Confirm Fulfillment
            </h2>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3">
                <img
                  src={fulfillTarget.user.image || '/default_slack.png'}
                  alt=""
                  className="w-10 h-10 border border-cream-500/20"
                />
                <div>
                  <p className="text-cream-50 font-medium">{fulfillTarget.user.name || fulfillTarget.user.email}</p>
                  {fulfillTarget.user.name && (
                    <p className="text-cream-200 text-xs">{fulfillTarget.user.email}</p>
                  )}
                </div>
              </div>

              <div className="bg-brown-900 border border-cream-500/20 p-4 space-y-2">
                <div className="flex items-center gap-3">
                  {fulfillTarget.itemImageUrl && (
                    <img src={fulfillTarget.itemImageUrl} alt="" className="w-12 h-12 object-contain border border-cream-500/20" />
                  )}
                  <div>
                    <p className="text-cream-50 font-medium">{fulfillTarget.itemName}</p>
                    <p className="text-cream-200 text-xs font-mono">{fulfillTarget.amount.toLocaleString()} bits</p>
                  </div>
                </div>
                <p className="text-cream-200 text-xs">
                  Purchased {formatDate(fulfillTarget.createdAt)}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setFulfillTarget(null)}
                disabled={fulfilling}
                className="flex-1 px-4 py-2.5 text-sm uppercase bg-brown-800 text-cream-50 hover:bg-cream-400 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleFulfill}
                disabled={fulfilling}
                className="flex-1 px-4 py-2.5 text-sm uppercase bg-orange-500 text-white hover:bg-orange-400 transition-colors cursor-pointer font-bold disabled:opacity-50"
              >
                {fulfilling ? 'Fulfilling...' : 'Confirm Fulfill'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
