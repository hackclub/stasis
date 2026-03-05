'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface ShopItem {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  price: number;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export default function AdminShopPage() {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formSortOrder, setFormSortOrder] = useState('0');
  const [formImageFile, setFormImageFile] = useState<File | null>(null);
  const [formImageUrl, setFormImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit mode
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/admin/shop');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
      } else {
        setFetchError('Failed to load shop items.');
      }
    } catch {
      setFetchError('Network error — could not load shop items.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormPrice('');
    setFormSortOrder('0');
    setFormImageFile(null);
    setFormImageUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setEditingId(null);
    setFormError(null);
  };

  const startEditing = (item: ShopItem) => {
    setEditingId(item.id);
    setFormName(item.name);
    setFormDescription(item.description);
    setFormPrice(String(item.price));
    setFormSortOrder(String(item.sortOrder));
    setFormImageUrl(item.imageUrl ?? '');
    setFormImageFile(null);
    setFormError(null);
  };

  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    if (!res.ok) throw new Error('Image upload failed');
    const { url } = await res.json();
    return url;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const price = parseInt(formPrice, 10);
    if (!formName.trim()) {
      setFormError('Name is required.');
      return;
    }
    if (!formDescription.trim()) {
      setFormError('Description is required.');
      return;
    }
    if (isNaN(price) || price <= 0) {
      setFormError('Price must be a positive integer.');
      return;
    }

    setSubmitting(true);
    try {
      let imageUrl = formImageUrl || null;
      if (formImageFile) {
        imageUrl = await uploadImage(formImageFile);
      }

      const body = {
        name: formName.trim(),
        description: formDescription.trim(),
        price,
        sortOrder: parseInt(formSortOrder, 10) || 0,
        imageUrl,
      };

      const url = editingId ? `/api/admin/shop/${editingId}` : '/api/admin/shop';
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        resetForm();
        fetchItems();
      } else {
        const data = await res.json().catch(() => ({}));
        const msg = typeof data.error === 'string' ? data.error.slice(0, 200) : null;
        setFormError(msg ?? 'Failed to save item.');
      }
    } catch {
      setFormError('Failed to save item.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this shop item? This cannot be undone.')) return;

    try {
      const res = await fetch(`/api/admin/shop/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchItems();
        if (editingId === id) resetForm();
      } else {
        alert('Failed to delete item.');
      }
    } catch {
      alert('Failed to delete item.');
    }
  };

  const handleToggleActive = async (item: ShopItem) => {
    try {
      const res = await fetch(`/api/admin/shop/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !item.active }),
      });
      if (res.ok) {
        fetchItems();
      } else {
        alert('Failed to update item.');
      }
    } catch {
      alert('Failed to update item.');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-orange-500 text-2xl uppercase tracking-wide">Shop Items</h1>
        <p className="text-brown-800 text-sm mt-1">
          Manage items available in the &ldquo;Other Items&rdquo; section of the shop. {items.length} item{items.length !== 1 ? 's' : ''} total.
        </p>
      </div>

      {/* Create / Edit form */}
      <div className="bg-cream-100 border-2 border-cream-400 p-6">
        <h2 className="text-brown-800 text-lg uppercase tracking-wide mb-4">
          {editingId ? 'Edit Item' : 'Add Item'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-brown-800 text-xs uppercase block mb-1">Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Item name"
                className="w-full bg-cream-50 border border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-brown-800 text-xs uppercase block mb-1">Price (bits)</label>
                <input
                  type="number"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  placeholder="e.g. 50"
                  min="1"
                  className="w-full bg-cream-50 border border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-brown-800 text-xs uppercase block mb-1">Sort Order <span className="normal-case text-cream-600">(price breaks ties)</span></label>
                <input
                  type="number"
                  value={formSortOrder}
                  onChange={(e) => setFormSortOrder(e.target.value)}
                  placeholder="0"
                  className="w-full bg-cream-50 border border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="text-brown-800 text-xs uppercase block mb-1">Description</label>
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Item description"
              rows={3}
              className="w-full bg-cream-50 border border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-y"
            />
          </div>
          <div>
            <label className="text-brown-800 text-xs uppercase block mb-1">Image</label>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setFormImageFile(file);
                }}
                className="text-brown-800 text-sm file:bg-cream-300 file:border file:border-cream-400 file:text-brown-800 file:px-3 file:py-1 file:text-sm file:cursor-pointer file:mr-3"
              />
              {(formImageUrl || formImageFile) && (
                <button
                  type="button"
                  onClick={() => { setFormImageFile(null); setFormImageUrl(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="text-red-600 text-xs uppercase hover:text-red-500 cursor-pointer"
                >
                  Remove
                </button>
              )}
            </div>
            {formImageUrl && !formImageFile && (
              <div className="mt-2">
                <img src={formImageUrl} alt="" className="h-20 border border-cream-400 object-contain" />
              </div>
            )}
          </div>
          {formError && <p className="text-red-600 text-sm">{formError}</p>}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="bg-orange-500 hover:bg-orange-400 text-white px-6 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Saving...' : editingId ? 'Save Changes' : 'Add Item'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="bg-cream-300 hover:bg-cream-400 text-brown-800 px-6 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Items table */}
      <div className="bg-cream-100 border-2 border-cream-400 overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center">
            <div className="flex items-center justify-center"><div className="loader" /></div>
          </div>
        ) : fetchError ? (
          <div className="p-8 text-center">
            <p className="text-red-600 text-sm">{fetchError}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-brown-800">No shop items yet. Add one above.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-cream-400">
                <th className="text-left text-brown-800 text-xs uppercase px-4 py-3">Image</th>
                <th className="text-left text-brown-800 text-xs uppercase px-4 py-3">Name</th>
                <th className="text-right text-brown-800 text-xs uppercase px-4 py-3">Price</th>
                <th className="text-center text-brown-800 text-xs uppercase px-4 py-3">Order</th>
                <th className="text-center text-brown-800 text-xs uppercase px-4 py-3">Active</th>
                <th className="text-right text-brown-800 text-xs uppercase px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-cream-300 last:border-b-0 hover:bg-cream-200/50">
                  <td className="px-4 py-3">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="w-12 h-12 object-contain border border-cream-400" />
                    ) : (
                      <div className="w-12 h-12 bg-cream-200 border border-cream-400 flex items-center justify-center">
                        <span className="text-cream-500 text-[10px] uppercase">None</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-brown-800 font-medium">{item.name}</p>
                    <p className="text-cream-600 text-xs truncate max-w-xs">{item.description}</p>
                  </td>
                  <td className="text-right px-4 py-3 text-brown-800 font-mono">
                    {item.price.toLocaleString()}
                  </td>
                  <td className="text-center px-4 py-3 text-brown-800 font-mono">
                    {item.sortOrder}
                  </td>
                  <td className="text-center px-4 py-3">
                    <button
                      onClick={() => handleToggleActive(item)}
                      className={`px-2 py-0.5 text-xs uppercase border cursor-pointer ${
                        item.active
                          ? 'bg-green-100 border-green-600 text-green-700'
                          : 'bg-red-100 border-red-600 text-red-700'
                      }`}
                    >
                      {item.active ? 'Active' : 'Hidden'}
                    </button>
                  </td>
                  <td className="text-right px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => startEditing(item)}
                        className="text-orange-500 hover:text-orange-400 text-xs uppercase cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-red-600 hover:text-red-500 text-xs uppercase cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
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
