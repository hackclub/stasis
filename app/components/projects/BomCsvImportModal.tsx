'use client';

import { useState, useCallback, useRef } from 'react';

const BOM_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'purpose', label: 'Purpose', required: false },
  { key: 'quantity', label: 'Quantity', required: false },
  { key: 'totalCost', label: 'Total Cost', required: true },
  { key: 'link', label: 'Link', required: false },
  { key: 'distributor', label: 'Distributor', required: false },
] as const;

type BomFieldKey = (typeof BOM_FIELDS)[number]['key'];

interface BomCsvImportModalProps {
  projectId: string;
  onClose: () => void;
  onImported: () => void;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(current);
        current = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
        row.push(current);
        current = '';
        if (row.some((c) => c.trim())) rows.push(row);
        row = [];
      } else {
        current += ch;
      }
    }
  }
  row.push(current);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

export function BomCsvImportModal({ projectId, onClose, onImported }: Readonly<BomCsvImportModalProps>) {
  const [step, setStep] = useState<'upload' | 'map' | 'preview'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<Record<BomFieldKey, number | null>>({
    name: null,
    purpose: null,
    quantity: null,
    totalCost: null,
    link: null,
    distributor: null,
  });
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: { row: number; error: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length < 2) {
        setError('CSV must have a header row and at least one data row.');
        return;
      }
      const headers = parsed[0].map((h) => h.trim());
      const dataRows = parsed.slice(1);
      setCsvHeaders(headers);
      setCsvRows(dataRows);

      // Auto-detect column mapping
      const newMap: Record<BomFieldKey, number | null> = {
        name: null,
        purpose: null,
        quantity: null,
        totalCost: null,
        link: null,
        distributor: null,
      };
      const matchers: Record<BomFieldKey, RegExp> = {
        name: /^(name|part|component|item|part\s*name|component\s*name)$/i,
        purpose: /^(purpose|description|desc|use|function|notes?)$/i,
        quantity: /^(quantity|qty|count|amount|num)$/i,
        totalCost: /^(total|total\s*cost|total\s*price|subtotal|line\s*total|ext\s*price|extended\s*price|cost|price)$/i,
        link: /^(link|url|href|product\s*link|source\s*link)$/i,
        distributor: /^(distributor|supplier|vendor|store|source|seller)$/i,
      };
      for (const field of BOM_FIELDS) {
        const idx = headers.findIndex((h) => matchers[field.key].test(h));
        if (idx !== -1) newMap[field.key] = idx;
      }
      setColumnMap(newMap);
      setStep('map');
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const mappedItems = csvRows.map((row) => {
    const item: Record<string, string> = {};
    for (const field of BOM_FIELDS) {
      const colIdx = columnMap[field.key];
      item[field.key] = colIdx !== null && colIdx < row.length ? row[colIdx].trim() : '';
    }
    return item;
  });

  const requiredMapped = BOM_FIELDS.filter((f) => f.required).every(
    (f) => columnMap[f.key] !== null
  );

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    try {
      const items = mappedItems.map((item) => ({
        name: item.name,
        purpose: item.purpose || null,
        quantity: item.quantity || null,
        totalCost: item.totalCost || null,
        link: item.link || null,
        distributor: item.distributor || null,
      }));

      const res = await fetch(`/api/projects/${projectId}/bom/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Import failed');
        if (data.errors?.length) {
          setResult({ imported: 0, errors: data.errors });
        }
      } else {
        setResult(data);
        if (data.imported > 0) {
          onImported();
        }
      }
    } catch {
      setError('Failed to import CSV');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-cream-100 border-2 border-cream-400 w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-cream-400">
          <h2 className="text-brown-800 text-lg uppercase tracking-wide">Import BOM from CSV</h2>
          <button onClick={onClose} className="text-cream-600 hover:text-brown-800 cursor-pointer text-xl leading-none">&times;</button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* Step: Upload */}
          {step === 'upload' && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-cream-400 hover:border-orange-500 p-12 flex flex-col items-center gap-4 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-cream-500">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="12" y2="12" />
                <line x1="15" y1="15" x2="12" y2="12" />
              </svg>
              <p className="text-brown-800 text-sm">Drop a CSV file here or click to browse</p>
              <p className="text-cream-600 text-xs">Supports .csv files with a header row</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
                className="hidden"
              />
            </div>
          )}

          {/* Step: Map Columns */}
          {step === 'map' && (
            <div>
              <p className="text-brown-800 text-sm mb-4">
                Map your CSV columns to BOM fields. We auto-detected what we could.
              </p>
              <div className="grid gap-3 mb-6">
                {BOM_FIELDS.map((field) => (
                  <div key={field.key} className="flex items-center gap-3">
                    <label className="text-brown-800 text-xs uppercase w-36 shrink-0">
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                    </label>
                    <select
                      value={columnMap[field.key] ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setColumnMap((prev) => ({
                          ...prev,
                          [field.key]: val === '' ? null : parseInt(val, 10),
                        }));
                      }}
                      className="flex-1 bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                    >
                      <option value="">{field.required ? '— Select field —' : '— Select field (optional) —'}</option>
                      {csvHeaders.map((header, idx) => (
                        <option key={idx} value={idx}>
                          {header || `Column ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview table */}
              <p className="text-brown-800 text-xs uppercase mb-2">
                Preview ({Math.min(csvRows.length, 5)} of {csvRows.length} rows)
              </p>
              <div className="overflow-x-auto border border-cream-400">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-cream-200">
                      <th className="text-left text-brown-800 px-2 py-1 uppercase">#</th>
                      {BOM_FIELDS.filter((f) => columnMap[f.key] !== null).map((f) => (
                        <th key={f.key} className="text-left text-brown-800 px-2 py-1 uppercase">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mappedItems.slice(0, 5).map((item, i) => (
                      <tr key={i} className="border-t border-cream-300">
                        <td className="text-cream-600 px-2 py-1">{i + 1}</td>
                        {BOM_FIELDS.filter((f) => columnMap[f.key] !== null).map((f) => (
                          <td key={f.key} className="text-brown-800 px-2 py-1 max-w-[200px] truncate">
                            {item[f.key] || <span className="text-cream-500">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="mt-4">
              {result.imported > 0 && (
                <div className="bg-green-600/20 border border-green-600 p-3 mb-3">
                  <p className="text-green-700 text-sm">Successfully imported {result.imported} item{result.imported !== 1 ? 's' : ''}.</p>
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="bg-red-600/20 border border-red-600 p-3">
                  <p className="text-red-600 text-sm mb-2">{result.errors.length} row{result.errors.length !== 1 ? 's' : ''} had errors:</p>
                  <ul className="text-red-600 text-xs space-y-1">
                    {result.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>Row {err.row}: {err.error}</li>
                    ))}
                    {result.errors.length > 10 && (
                      <li>...and {result.errors.length - 10} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {error && !result && (
            <div className="mt-4 bg-red-600/20 border border-red-600 p-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-cream-400">
          <div>
            {step === 'map' && !result && (
              <button
                onClick={() => {
                  setStep('upload');
                  setCsvHeaders([]);
                  setCsvRows([]);
                  setError(null);
                }}
                className="text-cream-600 hover:text-brown-800 text-xs uppercase cursor-pointer"
              >
                ← Choose Different File
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="bg-cream-300 hover:bg-cream-400 text-brown-800 px-4 py-2 text-xs uppercase tracking-wider transition-colors cursor-pointer"
            >
              {result?.imported ? 'Done' : 'Cancel'}
            </button>
            {step === 'map' && !result && (
              <button
                onClick={handleImport}
                disabled={!requiredMapped || importing}
                className="bg-orange-500 hover:bg-orange-400 disabled:bg-cream-300 disabled:text-cream-500 disabled:cursor-not-allowed text-white px-4 py-2 text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                {importing ? 'Importing...' : `Import ${csvRows.length} Item${csvRows.length !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
