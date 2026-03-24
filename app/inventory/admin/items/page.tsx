'use client';

import { useState, useEffect, useCallback } from 'react';

interface Item {
  id: string;
  name: string;
  description?: string;
  category: string;
  stock: number;
  maxPerTeam: number;
  imageUrl?: string;
}

interface DigiKeyImage {
  url: string;
  description?: string;
}

interface CSVRow {
  name: string;
  description: string;
  category: string;
  stock: number;
  max_per_team: number;
  image_url: string;
}

function parseCSV(text: string): CSVRow[] {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = parseRow(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    if (values.length < headers.length) continue;

    const nameIdx = headers.indexOf('name');
    const descIdx = headers.indexOf('description');
    const catIdx = headers.indexOf('category');
    const stockIdx = headers.indexOf('stock');
    const maxIdx = headers.indexOf('max_per_team');
    const imgIdx = headers.indexOf('image_url');

    if (nameIdx === -1 || catIdx === -1 || stockIdx === -1 || maxIdx === -1) continue;

    rows.push({
      name: values[nameIdx] || '',
      description: descIdx >= 0 ? values[descIdx] || '' : '',
      category: values[catIdx] || '',
      stock: parseInt(values[stockIdx], 10) || 0,
      max_per_team: parseInt(values[maxIdx], 10) || 0,
      image_url: imgIdx >= 0 ? values[imgIdx] || '' : '',
    });
  }

  return rows;
}

export default function AdminItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formStock, setFormStock] = useState('');
  const [formMaxPerTeam, setFormMaxPerTeam] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editStock, setEditStock] = useState('');
  const [editMaxPerTeam, setEditMaxPerTeam] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // DigiKey search
  const [digiKeyQuery, setDigiKeyQuery] = useState('');
  const [digiKeyResults, setDigiKeyResults] = useState<DigiKeyImage[]>([]);
  const [digiKeyLoading, setDigiKeyLoading] = useState(false);
  const [digiKeyTarget, setDigiKeyTarget] = useState<'add' | 'edit'>('add');

  // CSV import
  const [csvData, setCsvData] = useState<CSVRow[] | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/items');
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formName || !formCategory || !formStock || !formMaxPerTeam) {
      setFormError('Name, category, stock, and max per team are required.');
      return;
    }
    setFormSubmitting(true);
    try {
      const res = await fetch('/api/inventory/admin/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          description: formDescription || undefined,
          category: formCategory,
          stock: parseInt(formStock, 10),
          maxPerTeam: parseInt(formMaxPerTeam, 10),
          imageUrl: formImageUrl || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setFormError(err?.error || 'Failed to add item.');
        return;
      }
      setFormName('');
      setFormDescription('');
      setFormCategory('');
      setFormStock('');
      setFormMaxPerTeam('');
      setFormImageUrl('');
      await fetchItems();
    } catch {
      setFormError('Failed to add item.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      const res = await fetch(`/api/inventory/admin/items/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchItems();
      }
    } catch {
      // silently fail
    }
  };

  const startEdit = (item: Item) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditDescription(item.description || '');
    setEditCategory(item.category);
    setEditStock(String(item.stock));
    setEditMaxPerTeam(String(item.maxPerTeam));
    setEditImageUrl(item.imageUrl || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleEditSubmit = async (id: string) => {
    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/inventory/admin/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          description: editDescription || undefined,
          category: editCategory,
          stock: parseInt(editStock, 10),
          maxPerTeam: parseInt(editMaxPerTeam, 10),
          imageUrl: editImageUrl || undefined,
        }),
      });
      if (res.ok) {
        setEditingId(null);
        await fetchItems();
      }
    } catch {
      // silently fail
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDigiKeySearch = async () => {
    if (!digiKeyQuery.trim()) return;
    setDigiKeyLoading(true);
    setDigiKeyResults([]);
    try {
      const res = await fetch(
        `/api/inventory/digikey/search?q=${encodeURIComponent(digiKeyQuery)}`
      );
      if (res.ok) {
        const data = await res.json();
        setDigiKeyResults(data);
      }
    } catch {
      // silently fail
    } finally {
      setDigiKeyLoading(false);
    }
  };

  const selectDigiKeyImage = (url: string) => {
    if (digiKeyTarget === 'add') {
      setFormImageUrl(url);
    } else {
      setEditImageUrl(url);
    }
    setDigiKeyResults([]);
    setDigiKeyQuery('');
  };

  const handleCSVFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      setCsvData(parsed);
    };
    reader.readAsText(file);
  };

  const handleCSVImport = async () => {
    if (!csvData || csvData.length === 0) return;
    setCsvImporting(true);
    setCsvResult(null);
    try {
      const res = await fetch('/api/inventory/admin/items/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: csvData }),
      });
      if (res.ok) {
        const data = await res.json();
        setCsvResult(`Imported ${data.count ?? csvData.length} items successfully.`);
        setCsvData(null);
        await fetchItems();
      } else {
        const err = await res.json().catch(() => null);
        setCsvResult(`Import failed: ${err?.error || 'Unknown error'}`);
      }
    } catch {
      setCsvResult('Import failed.');
    } finally {
      setCsvImporting(false);
    }
  };

  return (
    <div className="font-mono space-y-8">
      {/* Add Item Form */}
      <div className="border-2 border-brown-800 bg-cream-100 p-4">
        <h3 className="text-brown-800 text-sm uppercase tracking-wider mb-4 font-bold">
          Add Item
        </h3>
        <form onSubmit={handleAddItem} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-brown-800/70 text-xs uppercase mb-1">
                Name *
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800"
                required
              />
            </div>
            <div>
              <label className="block text-brown-800/70 text-xs uppercase mb-1">
                Category *
              </label>
              <input
                type="text"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800"
                required
              />
            </div>
            <div>
              <label className="block text-brown-800/70 text-xs uppercase mb-1">
                Stock *
              </label>
              <input
                type="number"
                value={formStock}
                onChange={(e) => setFormStock(e.target.value)}
                className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800"
                min="0"
                required
              />
            </div>
            <div>
              <label className="block text-brown-800/70 text-xs uppercase mb-1">
                Max Per Team *
              </label>
              <input
                type="number"
                value={formMaxPerTeam}
                onChange={(e) => setFormMaxPerTeam(e.target.value)}
                className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800"
                min="0"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-brown-800/70 text-xs uppercase mb-1">
              Description
            </label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800"
            />
          </div>
          <div>
            <label className="block text-brown-800/70 text-xs uppercase mb-1">
              Image URL
            </label>
            <input
              type="text"
              value={formImageUrl}
              onChange={(e) => setFormImageUrl(e.target.value)}
              className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800"
              placeholder="https://..."
            />
          </div>
          {formError && <p className="text-red-600 text-sm">{formError}</p>}
          <button
            type="submit"
            disabled={formSubmitting}
            className="bg-orange-500 text-cream-50 px-4 py-2 hover:bg-orange-600 transition-colors uppercase text-sm tracking-wider disabled:opacity-50"
          >
            {formSubmitting ? 'Adding...' : 'Add Item'}
          </button>
        </form>
      </div>

      {/* DigiKey Image Search */}
      <div className="border-2 border-brown-800 bg-cream-100 p-4">
        <h3 className="text-brown-800 text-sm uppercase tracking-wider mb-3 font-bold">
          DigiKey Image Search
        </h3>
        <div className="flex gap-2 items-end mb-2">
          <label className="flex items-center gap-2 text-xs text-brown-800/70 uppercase">
            <input
              type="radio"
              checked={digiKeyTarget === 'add'}
              onChange={() => setDigiKeyTarget('add')}
            />
            Add Form
          </label>
          <label className="flex items-center gap-2 text-xs text-brown-800/70 uppercase">
            <input
              type="radio"
              checked={digiKeyTarget === 'edit'}
              onChange={() => setDigiKeyTarget('edit')}
            />
            Edit Form
          </label>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={digiKeyQuery}
            onChange={(e) => setDigiKeyQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleDigiKeySearch()}
            placeholder="Search for component images..."
            className="flex-1 border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800"
          />
          <button
            onClick={handleDigiKeySearch}
            disabled={digiKeyLoading}
            className="bg-orange-500 text-cream-50 px-4 py-2 hover:bg-orange-600 transition-colors uppercase text-sm tracking-wider disabled:opacity-50"
          >
            {digiKeyLoading ? '...' : 'Search'}
          </button>
        </div>
        {digiKeyResults.length > 0 && (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-3">
            {digiKeyResults.map((img, i) => (
              <button
                key={i}
                onClick={() => selectDigiKeyImage(img.url)}
                className="border-2 border-cream-200 hover:border-orange-500 transition-colors p-1"
              >
                <img
                  src={img.url}
                  alt={img.description || 'Component'}
                  className="w-full h-16 object-contain"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Items Table */}
      <div>
        <h3 className="text-brown-800 text-sm uppercase tracking-wider mb-3 font-bold">
          Items ({items.length})
        </h3>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="loader" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-brown-800/60 text-sm">No items in inventory.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-2 border-brown-800 text-sm">
              <thead>
                <tr className="bg-brown-800 text-cream-50">
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">
                    Name
                  </th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">
                    Category
                  </th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">
                    Stock
                  </th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">
                    Max/Team
                  </th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">
                    Image
                  </th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-cream-200">
                    {editingId === item.id ? (
                      <>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full border-2 border-brown-800 bg-cream-50 px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="w-full border-2 border-brown-800 bg-cream-50 px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={editStock}
                            onChange={(e) => setEditStock(e.target.value)}
                            className="w-24 border-2 border-brown-800 bg-cream-50 px-2 py-1 text-sm"
                            min="0"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={editMaxPerTeam}
                            onChange={(e) => setEditMaxPerTeam(e.target.value)}
                            className="w-24 border-2 border-brown-800 bg-cream-50 px-2 py-1 text-sm"
                            min="0"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={editImageUrl}
                            onChange={(e) => setEditImageUrl(e.target.value)}
                            className="w-full border-2 border-brown-800 bg-cream-50 px-2 py-1 text-sm"
                            placeholder="URL"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleEditSubmit(item.id)}
                              disabled={editSubmitting}
                              className="bg-orange-500 text-cream-50 px-2 py-1 text-xs uppercase hover:bg-orange-600 disabled:opacity-50"
                            >
                              {editSubmitting ? '...' : 'Save'}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="border border-brown-800 text-brown-800 px-2 py-1 text-xs uppercase hover:bg-cream-200"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-brown-800">{item.name}</td>
                        <td className="px-3 py-2 text-brown-800/70">{item.category}</td>
                        <td className="px-3 py-2 text-brown-800">{item.stock}</td>
                        <td className="px-3 py-2 text-brown-800">{item.maxPerTeam}</td>
                        <td className="px-3 py-2">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-10 h-10 object-contain"
                            />
                          ) : (
                            <span className="text-brown-800/30 text-xs">--</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button
                              onClick={() => startEdit(item)}
                              className="border border-brown-800 text-brown-800 px-2 py-1 text-xs uppercase hover:bg-cream-200"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="border border-red-600 text-red-600 px-2 py-1 text-xs uppercase hover:bg-red-600 hover:text-cream-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CSV Import */}
      <div className="border-2 border-brown-800 bg-cream-100 p-4">
        <h3 className="text-brown-800 text-sm uppercase tracking-wider mb-3 font-bold">
          CSV Import
        </h3>
        <p className="text-brown-800/60 text-xs mb-3">
          Expected columns: name, description, category, stock, max_per_team, image_url
        </p>
        <input
          type="file"
          accept=".csv"
          onChange={handleCSVFile}
          className="block text-sm text-brown-800 file:mr-4 file:px-4 file:py-2 file:border-2 file:border-brown-800 file:bg-cream-50 file:text-brown-800 file:text-sm file:uppercase file:tracking-wider file:cursor-pointer hover:file:bg-cream-200"
        />

        {csvData && csvData.length > 0 && (
          <div className="mt-4">
            <p className="text-brown-800 text-sm mb-2">
              Preview ({csvData.length} rows):
            </p>
            <div className="overflow-x-auto max-h-60 overflow-y-auto">
              <table className="w-full border-2 border-brown-800 text-xs">
                <thead>
                  <tr className="bg-brown-800 text-cream-50">
                    <th className="px-2 py-1 text-left">Name</th>
                    <th className="px-2 py-1 text-left">Description</th>
                    <th className="px-2 py-1 text-left">Category</th>
                    <th className="px-2 py-1 text-left">Stock</th>
                    <th className="px-2 py-1 text-left">Max/Team</th>
                    <th className="px-2 py-1 text-left">Image URL</th>
                  </tr>
                </thead>
                <tbody>
                  {csvData.map((row, i) => (
                    <tr key={i} className="border-t border-cream-200">
                      <td className="px-2 py-1 text-brown-800">{row.name}</td>
                      <td className="px-2 py-1 text-brown-800/70 max-w-[200px] truncate">
                        {row.description}
                      </td>
                      <td className="px-2 py-1 text-brown-800">{row.category}</td>
                      <td className="px-2 py-1 text-brown-800">{row.stock}</td>
                      <td className="px-2 py-1 text-brown-800">{row.max_per_team}</td>
                      <td className="px-2 py-1 text-brown-800/70 max-w-[150px] truncate">
                        {row.image_url}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={handleCSVImport}
              disabled={csvImporting}
              className="mt-3 bg-orange-500 text-cream-50 px-4 py-2 hover:bg-orange-600 transition-colors uppercase text-sm tracking-wider disabled:opacity-50"
            >
              {csvImporting ? 'Importing...' : 'Import'}
            </button>
          </div>
        )}

        {csvResult && (
          <p
            className={`mt-3 text-sm ${
              csvResult.startsWith('Import failed') ? 'text-red-600' : 'text-brown-800'
            }`}
          >
            {csvResult}
          </p>
        )}
      </div>
    </div>
  );
}
