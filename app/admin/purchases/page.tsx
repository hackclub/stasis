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
  }, [debouncedUser, itemFilter]);

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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
