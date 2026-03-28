'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

interface Item {
  id: string;
  name: string;
  description?: string;
  category: string;
  stock: number;
  maxPerTeam: number;
  imageUrl?: string;
}

interface Tool {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  available: boolean;
}

interface DigiKeyResult {
  name: string;
  description: string;
  manufacturer: string;
  partNumber: string;
  imageUrl: string;
  category: string;
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
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; } else { current += ch; }
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
      name: values[nameIdx] || '', description: descIdx >= 0 ? values[descIdx] || '' : '',
      category: values[catIdx] || '', stock: parseInt(values[stockIdx], 10) || 0,
      max_per_team: parseInt(values[maxIdx], 10) || 0, image_url: imgIdx >= 0 ? values[imgIdx] || '' : '',
    });
  }
  return rows;
}

export default function AdminInventoryPage() {
  // Items
  const [items, setItems] = useState<Item[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const categories = useMemo(() => [...new Set(items.map((i) => i.category))].sort(), [items]);

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formStock, setFormStock] = useState('');
  const [formMaxPerTeam, setFormMaxPerTeam] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemDescription, setEditItemDescription] = useState('');
  const [editItemCategory, setEditItemCategory] = useState('');
  const [editItemStock, setEditItemStock] = useState('');
  const [editItemMaxPerTeam, setEditItemMaxPerTeam] = useState('');
  const [editItemImageUrl, setEditItemImageUrl] = useState('');
  const [editItemSubmitting, setEditItemSubmitting] = useState(false);

  const [digiKeyResults, setDigiKeyResults] = useState<DigiKeyResult[]>([]);
  const [digiKeyLoading, setDigiKeyLoading] = useState(false);
  const [digiKeyContext, setDigiKeyContext] = useState<'item-add' | 'item-edit' | 'tool-add' | 'tool-edit' | null>(null);
  const [pendingItemDkName, setPendingItemDkName] = useState<string | null>(null);

  const [csvData, setCsvData] = useState<CSVRow[] | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<string | null>(null);

  // Tools
  const [tools, setTools] = useState<Tool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [toolFormName, setToolFormName] = useState('');
  const [toolFormDescription, setToolFormDescription] = useState('');
  const [toolFormImageUrl, setToolFormImageUrl] = useState('');
  const [toolFormSubmitting, setToolFormSubmitting] = useState(false);
  const [toolFormError, setToolFormError] = useState<string | null>(null);
  const [editingToolId, setEditingToolId] = useState<string | null>(null);
  const [editToolName, setEditToolName] = useState('');
  const [editToolDescription, setEditToolDescription] = useState('');
  const [editToolImageUrl, setEditToolImageUrl] = useState('');
  const [editToolSubmitting, setEditToolSubmitting] = useState(false);
  const [pendingToolDkName, setPendingToolDkName] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try { const res = await fetch('/api/inventory/items'); if (res.ok) setItems(await res.json()); } catch {} finally { setItemsLoading(false); }
  }, []);
  const fetchTools = useCallback(async () => {
    try { const res = await fetch('/api/inventory/admin/tools'); if (res.ok) setTools(await res.json()); } catch {} finally { setToolsLoading(false); }
  }, []);
  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { fetchTools(); }, [fetchTools]);

  const handleDigiKeySearch = async (query: string, context: 'item-add' | 'item-edit' | 'tool-add' | 'tool-edit') => {
    if (!query.trim()) return;
    setDigiKeyLoading(true); setDigiKeyResults([]); setDigiKeyContext(context);
    try { const res = await fetch(`/api/inventory/digikey/search?q=${encodeURIComponent(query)}`); if (res.ok) setDigiKeyResults(await res.json()); } catch {} finally { setDigiKeyLoading(false); }
  };

  // Item handlers
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError(null);
    if (!formName || !formCategory || !formStock || !formMaxPerTeam) { setFormError('Name, category, stock, and max per team are required.'); return; }
    setFormSubmitting(true);
    try {
      const res = await fetch('/api/inventory/admin/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: formName, description: formDescription || undefined, category: formCategory, stock: parseInt(formStock, 10), maxPerTeam: parseInt(formMaxPerTeam, 10), imageUrl: formImageUrl || undefined }) });
      if (!res.ok) { const err = await res.json().catch(() => null); setFormError(err?.error || 'Failed to add item.'); return; }
      setFormName(''); setFormDescription(''); setFormCategory(''); setFormStock(''); setFormMaxPerTeam(''); setFormImageUrl('');
      await fetchItems();
    } catch { setFormError('Failed to add item.'); } finally { setFormSubmitting(false); }
  };
  const handleDeleteItem = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    try { const res = await fetch(`/api/inventory/admin/items/${id}`, { method: 'DELETE' }); if (res.ok) await fetchItems(); } catch {}
  };
  const startEditItem = (item: Item) => { setEditingItemId(item.id); setEditItemName(item.name); setEditItemDescription(item.description || ''); setEditItemCategory(item.category); setEditItemStock(String(item.stock)); setEditItemMaxPerTeam(String(item.maxPerTeam)); setEditItemImageUrl(item.imageUrl || ''); };
  const handleEditItemSubmit = async (id: string) => {
    setEditItemSubmitting(true);
    try {
      const res = await fetch(`/api/inventory/admin/items/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editItemName, description: editItemDescription || undefined, category: editItemCategory, stock: parseInt(editItemStock, 10), maxPerTeam: parseInt(editItemMaxPerTeam, 10), imageUrl: editItemImageUrl || undefined }) });
      if (res.ok) { setEditingItemId(null); await fetchItems(); }
    } catch {} finally { setEditItemSubmitting(false); }
  };

  // Tool handlers
  const handleAddTool = async (e: React.FormEvent) => {
    e.preventDefault(); setToolFormError(null);
    if (!toolFormName) { setToolFormError('Name is required.'); return; }
    setToolFormSubmitting(true);
    try {
      const res = await fetch('/api/inventory/admin/tools', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: toolFormName, description: toolFormDescription || undefined, imageUrl: toolFormImageUrl || undefined }) });
      if (!res.ok) { const err = await res.json().catch(() => null); setToolFormError(err?.error || 'Failed to add tool.'); return; }
      setToolFormName(''); setToolFormDescription(''); setToolFormImageUrl('');
      await fetchTools();
    } catch { setToolFormError('Failed to add tool.'); } finally { setToolFormSubmitting(false); }
  };
  const handleDeleteTool = async (id: string) => {
    if (!confirm('Delete this tool?')) return; setDeleteError(null);
    try { const res = await fetch(`/api/inventory/admin/tools/${id}`, { method: 'DELETE' }); if (res.ok) await fetchTools(); else { const err = await res.json().catch(() => null); setDeleteError(err?.error || 'Failed to delete.'); } } catch { setDeleteError('Failed to delete.'); }
  };
  const startEditTool = (tool: Tool) => { setEditingToolId(tool.id); setEditToolName(tool.name); setEditToolDescription(tool.description || ''); setEditToolImageUrl(tool.imageUrl || ''); };
  const handleEditToolSubmit = async (id: string) => {
    setEditToolSubmitting(true);
    try {
      const res = await fetch(`/api/inventory/admin/tools/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editToolName, description: editToolDescription || undefined, imageUrl: editToolImageUrl || undefined }) });
      if (res.ok) { setEditingToolId(null); await fetchTools(); }
    } catch {} finally { setEditToolSubmitting(false); }
  };

  const handleCSVFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; setCsvResult(null);
    const reader = new FileReader(); reader.onload = (ev) => { setCsvData(parseCSV(ev.target?.result as string)); }; reader.readAsText(file);
  };
  const handleCSVImport = async () => {
    if (!csvData || csvData.length === 0) return; setCsvImporting(true); setCsvResult(null);
    try {
      const res = await fetch('/api/inventory/admin/items/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: csvData }) });
      if (res.ok) { const data = await res.json(); setCsvResult(`Imported ${data.imported ?? csvData.length} items.`); setCsvData(null); await fetchItems(); }
      else { const err = await res.json().catch(() => null); setCsvResult(`Import failed: ${err?.error || 'Unknown error'}`); }
    } catch { setCsvResult('Import failed.'); } finally { setCsvImporting(false); }
  };

  return (
    <div className="font-mono space-y-10">
      {/* ==================== ITEMS ==================== */}
      <section>
        <h2 className="text-brown-800 font-bold text-lg uppercase tracking-wide mb-4">Items</h2>

        {/* Add Item */}
        <div className="border-2 border-brown-800 bg-cream-100 p-4 mb-6">
          <h3 className="text-brown-800 text-sm uppercase tracking-wider mb-4 font-bold">Add Item</h3>
          <form onSubmit={handleAddItem} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-brown-800/70 text-xs uppercase mb-1">Name *</label>
                <input type="text" value={formName} onChange={(e) => { setFormName(e.target.value); setPendingItemDkName(null); }} className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800" required />
                {pendingItemDkName && pendingItemDkName !== formName && (
                  <button type="button" onClick={() => { setFormName(pendingItemDkName); setPendingItemDkName(null); }} className="mt-1 text-xs text-orange-500 hover:text-orange-600 underline">Use DigiKey name: {pendingItemDkName}</button>
                )}
              </div>
              <div>
                <label className="block text-brown-800/70 text-xs uppercase mb-1">Category *</label>
                <input type="text" list="category-options" value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800" placeholder="Select or type new..." required />
                <datalist id="category-options">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <label className="block text-brown-800/70 text-xs uppercase mb-1">Stock *</label>
                <input type="number" value={formStock} onChange={(e) => setFormStock(e.target.value)} className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800" min="0" required />
              </div>
              <div>
                <label className="block text-brown-800/70 text-xs uppercase mb-1">Max Per Team *</label>
                <input type="number" value={formMaxPerTeam} onChange={(e) => setFormMaxPerTeam(e.target.value)} className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800" min="0" required />
              </div>
            </div>
            <div>
              <label className="block text-brown-800/70 text-xs uppercase mb-1">Description</label>
              <input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800" />
            </div>
            <div>
              <label className="block text-brown-800/70 text-xs uppercase mb-1">Image URL</label>
              <input type="text" value={formImageUrl} onChange={(e) => setFormImageUrl(e.target.value)} className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800" placeholder="https://..." />
            </div>
            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={formSubmitting} className="bg-orange-500 text-cream-50 px-4 py-2 hover:bg-orange-600 transition-colors uppercase text-sm tracking-wider disabled:opacity-50">{formSubmitting ? 'Adding...' : 'Add Item'}</button>
              {formName.trim() && (
                <button type="button" onClick={() => handleDigiKeySearch(formName, 'item-add')} disabled={digiKeyLoading} className="border-2 border-brown-800 text-brown-800 px-4 py-2 hover:bg-brown-800 hover:text-cream-50 transition-colors uppercase text-sm tracking-wider disabled:opacity-50">{digiKeyLoading ? '...' : 'Autofill from DigiKey'}</button>
              )}
            </div>
            {digiKeyResults.length > 0 && digiKeyContext === 'item-add' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {digiKeyResults.map((result, i) => (
                  <button key={i} type="button" onClick={() => { setFormImageUrl(result.imageUrl); setFormDescription(result.description); setPendingItemDkName(result.name); setDigiKeyResults([]); }} className="border-2 border-cream-200 hover:border-orange-500 transition-colors p-2 flex gap-3 items-center text-left">
                    <img src={result.imageUrl} alt={result.name || 'Component'} className="w-16 h-16 object-contain shrink-0" />
                    <div className="min-w-0">
                      <p className="text-brown-800 text-xs font-bold truncate">{result.partNumber}</p>
                      <p className="text-brown-800/70 text-xs truncate">{result.description}</p>
                      <p className="text-brown-800/50 text-xs truncate">{result.manufacturer}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </form>
        </div>

        {/* Items Table */}
        {itemsLoading ? (
          <div className="flex justify-center py-12"><div className="loader" /></div>
        ) : items.length === 0 ? (
          <p className="text-brown-800/60 text-sm">No items in inventory.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-2 border-brown-800 text-sm">
              <thead>
                <tr className="bg-brown-800 text-cream-50">
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">Name</th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">Category</th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">Stock</th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">Max/Team</th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">Image</th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-cream-200">
                    {editingItemId === item.id ? (
                      <>
                        <td className="px-3 py-2"><input type="text" value={editItemName} onChange={(e) => setEditItemName(e.target.value)} className="w-full border-2 border-brown-800 bg-cream-50 px-2 py-1 text-sm" /></td>
                        <td className="px-3 py-2">
                          <input type="text" list="cat-edit" value={editItemCategory} onChange={(e) => setEditItemCategory(e.target.value)} className="w-full border-2 border-brown-800 bg-cream-50 px-2 py-1 text-sm" />
                          <datalist id="cat-edit">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                        </td>
                        <td className="px-3 py-2"><input type="number" value={editItemStock} onChange={(e) => setEditItemStock(e.target.value)} className="w-24 border-2 border-brown-800 bg-cream-50 px-2 py-1 text-sm" min="0" /></td>
                        <td className="px-3 py-2"><input type="number" value={editItemMaxPerTeam} onChange={(e) => setEditItemMaxPerTeam(e.target.value)} className="w-24 border-2 border-brown-800 bg-cream-50 px-2 py-1 text-sm" min="0" /></td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <input type="text" value={editItemImageUrl} onChange={(e) => setEditItemImageUrl(e.target.value)} className="flex-1 border-2 border-brown-800 bg-cream-50 px-2 py-1 text-sm min-w-0" placeholder="URL" />
                            <button type="button" onClick={() => handleDigiKeySearch(editItemName, 'item-edit')} disabled={digiKeyLoading || !editItemName.trim()} className="border border-brown-800 text-brown-800 px-2 py-1 text-xs uppercase hover:bg-cream-200 disabled:opacity-50 shrink-0">{digiKeyLoading ? '...' : 'DK'}</button>
                          </div>
                          {digiKeyResults.length > 0 && digiKeyContext === 'item-edit' && editingItemId === item.id && (
                            <div className="mt-1 space-y-1">
                              {digiKeyResults.slice(0, 4).map((result, i) => (
                                <button key={i} type="button" onClick={() => { setEditItemImageUrl(result.imageUrl); if (!editItemDescription) setEditItemDescription(result.description); setDigiKeyResults([]); }} className="w-full border border-cream-200 hover:border-orange-500 p-1 flex gap-2 items-center text-left text-xs">
                                  <img src={result.imageUrl} alt="" className="w-8 h-8 object-contain shrink-0" />
                                  <span className="truncate text-brown-800/70">{result.description}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button onClick={() => handleEditItemSubmit(item.id)} disabled={editItemSubmitting} className="bg-orange-500 text-cream-50 px-2 py-1 text-xs uppercase hover:bg-orange-600 disabled:opacity-50">{editItemSubmitting ? '...' : 'Save'}</button>
                            <button onClick={() => { setEditingItemId(null); setDigiKeyResults([]); }} className="border border-brown-800 text-brown-800 px-2 py-1 text-xs uppercase hover:bg-cream-200">Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-brown-800">{item.name}</td>
                        <td className="px-3 py-2 text-brown-800/70">{item.category}</td>
                        <td className="px-3 py-2 text-brown-800">{item.stock}</td>
                        <td className="px-3 py-2 text-brown-800">{item.maxPerTeam}</td>
                        <td className="px-3 py-2">{item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="w-10 h-10 object-contain" /> : <span className="text-brown-800/30 text-xs">--</span>}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button onClick={() => startEditItem(item)} className="border border-brown-800 text-brown-800 px-2 py-1 text-xs uppercase hover:bg-cream-200">Edit</button>
                            <button onClick={() => handleDeleteItem(item.id)} className="border border-orange-500 text-orange-500 px-2 py-1 text-xs uppercase hover:bg-orange-500 hover:text-cream-50">Delete</button>
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

        {/* CSV Import */}
        <div className="border-2 border-brown-800 bg-cream-100 p-4 mt-6">
          <h3 className="text-brown-800 text-sm uppercase tracking-wider mb-3 font-bold">CSV Import</h3>
          <p className="text-brown-800/60 text-xs mb-3">Expected columns: name, description, category, stock, max_per_team, image_url</p>
          <input type="file" accept=".csv" onChange={handleCSVFile} className="block text-sm text-brown-800 file:mr-4 file:px-4 file:py-2 file:border-2 file:border-brown-800 file:bg-cream-50 file:text-brown-800 file:text-sm file:uppercase file:tracking-wider file:cursor-pointer hover:file:bg-cream-200" />
          {csvData && csvData.length > 0 && (
            <div className="mt-4">
              <p className="text-brown-800 text-sm mb-2">Preview ({csvData.length} rows):</p>
              <div className="overflow-x-auto max-h-60 overflow-y-auto">
                <table className="w-full border-2 border-brown-800 text-xs">
                  <thead><tr className="bg-brown-800 text-cream-50"><th className="px-2 py-1 text-left">Name</th><th className="px-2 py-1 text-left">Desc</th><th className="px-2 py-1 text-left">Category</th><th className="px-2 py-1 text-left">Stock</th><th className="px-2 py-1 text-left">Max</th><th className="px-2 py-1 text-left">Image</th></tr></thead>
                  <tbody>{csvData.map((row, i) => (<tr key={i} className="border-t border-cream-200"><td className="px-2 py-1 text-brown-800">{row.name}</td><td className="px-2 py-1 text-brown-800/70 max-w-[200px] truncate">{row.description}</td><td className="px-2 py-1 text-brown-800">{row.category}</td><td className="px-2 py-1 text-brown-800">{row.stock}</td><td className="px-2 py-1 text-brown-800">{row.max_per_team}</td><td className="px-2 py-1 text-brown-800/70 max-w-[150px] truncate">{row.image_url}</td></tr>))}</tbody>
                </table>
              </div>
              <button onClick={handleCSVImport} disabled={csvImporting} className="mt-3 bg-orange-500 text-cream-50 px-4 py-2 hover:bg-orange-600 transition-colors uppercase text-sm tracking-wider disabled:opacity-50">{csvImporting ? 'Importing...' : 'Import'}</button>
            </div>
          )}
          {csvResult && <p className={`mt-3 text-sm ${csvResult.startsWith('Import failed') ? 'text-red-600' : 'text-brown-800'}`}>{csvResult}</p>}
        </div>
      </section>

      {/* ==================== TOOLS ==================== */}
      <section>
        <h2 className="text-brown-800 font-bold text-lg uppercase tracking-wide mb-4">Tools</h2>

        {/* Add Tool */}
        <div className="border-2 border-brown-800 bg-cream-100 p-4 mb-6">
          <h3 className="text-brown-800 text-sm uppercase tracking-wider mb-4 font-bold">Add Tool</h3>
          <p className="text-brown-800/60 text-xs mb-3">Each row = one physical tool. Add one entry per unit.</p>
          <form onSubmit={handleAddTool} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-brown-800/70 text-xs uppercase mb-1">Name *</label>
                <input type="text" value={toolFormName} onChange={(e) => { setToolFormName(e.target.value); setPendingToolDkName(null); }} className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800" placeholder="e.g., Soldering Iron - Hakko FX888D" required />
                {pendingToolDkName && pendingToolDkName !== toolFormName && (
                  <button type="button" onClick={() => { setToolFormName(pendingToolDkName); setPendingToolDkName(null); }} className="mt-1 text-xs text-orange-500 hover:text-orange-600 underline">Use DigiKey name: {pendingToolDkName}</button>
                )}
              </div>
              <div>
                <label className="block text-brown-800/70 text-xs uppercase mb-1">Image URL</label>
                <input type="text" value={toolFormImageUrl} onChange={(e) => setToolFormImageUrl(e.target.value)} className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800" placeholder="https://..." />
              </div>
            </div>
            <div>
              <label className="block text-brown-800/70 text-xs uppercase mb-1">Description</label>
              <input type="text" value={toolFormDescription} onChange={(e) => setToolFormDescription(e.target.value)} className="w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800" />
            </div>
            {toolFormError && <p className="text-red-600 text-sm">{toolFormError}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={toolFormSubmitting} className="bg-orange-500 text-cream-50 px-4 py-2 hover:bg-orange-600 transition-colors uppercase text-sm tracking-wider disabled:opacity-50">{toolFormSubmitting ? 'Adding...' : 'Add Tool'}</button>
              {toolFormName.trim() && (
                <button type="button" onClick={() => handleDigiKeySearch(toolFormName, 'tool-add')} disabled={digiKeyLoading} className="border-2 border-brown-800 text-brown-800 px-4 py-2 hover:bg-brown-800 hover:text-cream-50 transition-colors uppercase text-sm tracking-wider disabled:opacity-50">{digiKeyLoading ? '...' : 'Autofill from DigiKey'}</button>
              )}
            </div>
            {digiKeyResults.length > 0 && digiKeyContext === 'tool-add' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {digiKeyResults.map((result, i) => (
                  <button key={i} type="button" onClick={() => { setToolFormImageUrl(result.imageUrl); setToolFormDescription(result.description); setPendingToolDkName(result.name); setDigiKeyResults([]); }} className="border-2 border-cream-200 hover:border-orange-500 transition-colors p-2 flex gap-3 items-center text-left">
                    <img src={result.imageUrl} alt={result.name || 'Component'} className="w-16 h-16 object-contain shrink-0" />
                    <div className="min-w-0">
                      <p className="text-brown-800 text-xs font-bold truncate">{result.partNumber}</p>
                      <p className="text-brown-800/70 text-xs truncate">{result.description}</p>
                      <p className="text-brown-800/50 text-xs truncate">{result.manufacturer}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </form>
        </div>

        {/* Tools Table */}
        {deleteError && <p className="text-red-600 text-sm mb-3">{deleteError}</p>}
        {toolsLoading ? (
          <div className="flex justify-center py-12"><div className="loader" /></div>
        ) : tools.length === 0 ? (
          <p className="text-brown-800/60 text-sm">No tools registered.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-2 border-brown-800 text-sm">
              <thead>
                <tr className="bg-brown-800 text-cream-50">
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">Name</th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">Description</th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">Status</th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">Image</th>
                  <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((tool) => (
                  <tr key={tool.id} className="border-t border-cream-200">
                    {editingToolId === tool.id ? (
                      <>
                        <td className="px-3 py-2"><input type="text" value={editToolName} onChange={(e) => setEditToolName(e.target.value)} className="w-full border-2 border-brown-800 bg-cream-50 px-2 py-1 text-sm" /></td>
                        <td className="px-3 py-2"><input type="text" value={editToolDescription} onChange={(e) => setEditToolDescription(e.target.value)} className="w-full border-2 border-brown-800 bg-cream-50 px-2 py-1 text-sm" /></td>
                        <td className="px-3 py-2"><span className={`text-xs uppercase ${tool.available ? 'text-green-600' : 'text-orange-500'}`}>{tool.available ? 'Available' : 'Rented'}</span></td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <input type="text" value={editToolImageUrl} onChange={(e) => setEditToolImageUrl(e.target.value)} className="flex-1 border-2 border-brown-800 bg-cream-50 px-2 py-1 text-sm min-w-0" placeholder="URL" />
                            <button type="button" onClick={() => handleDigiKeySearch(editToolName, 'tool-edit')} disabled={digiKeyLoading || !editToolName.trim()} className="border border-brown-800 text-brown-800 px-2 py-1 text-xs uppercase hover:bg-cream-200 disabled:opacity-50 shrink-0">{digiKeyLoading ? '...' : 'DK'}</button>
                          </div>
                          {digiKeyResults.length > 0 && digiKeyContext === 'tool-edit' && editingToolId === tool.id && (
                            <div className="mt-1 space-y-1">
                              {digiKeyResults.slice(0, 4).map((result, i) => (
                                <button key={i} type="button" onClick={() => { setEditToolImageUrl(result.imageUrl); if (!editToolDescription) setEditToolDescription(result.description); setDigiKeyResults([]); }} className="w-full border border-cream-200 hover:border-orange-500 p-1 flex gap-2 items-center text-left text-xs">
                                  <img src={result.imageUrl} alt="" className="w-8 h-8 object-contain shrink-0" />
                                  <span className="truncate text-brown-800/70">{result.description}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button onClick={() => handleEditToolSubmit(tool.id)} disabled={editToolSubmitting} className="bg-orange-500 text-cream-50 px-2 py-1 text-xs uppercase hover:bg-orange-600 disabled:opacity-50">{editToolSubmitting ? '...' : 'Save'}</button>
                            <button onClick={() => { setEditingToolId(null); setDigiKeyResults([]); }} className="border border-brown-800 text-brown-800 px-2 py-1 text-xs uppercase hover:bg-cream-200">Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-brown-800">{tool.name}</td>
                        <td className="px-3 py-2 text-brown-800/70">{tool.description || '--'}</td>
                        <td className="px-3 py-2"><span className={`text-xs uppercase ${tool.available ? 'text-green-600' : 'text-orange-500'}`}>{tool.available ? 'Available' : 'Rented'}</span></td>
                        <td className="px-3 py-2">{tool.imageUrl ? <img src={tool.imageUrl} alt={tool.name} className="w-10 h-10 object-contain" /> : <span className="text-brown-800/30 text-xs">--</span>}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button onClick={() => startEditTool(tool)} className="border border-brown-800 text-brown-800 px-2 py-1 text-xs uppercase hover:bg-cream-200">Edit</button>
                            <button onClick={() => handleDeleteTool(tool.id)} className="border border-orange-500 text-orange-500 px-2 py-1 text-xs uppercase hover:bg-orange-500 hover:text-cream-50">Delete</button>
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
      </section>
    </div>
  );
}
