'use client';

import { useState, useEffect } from 'react';

interface Settings {
  enabled: boolean;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/inventory/admin/settings')
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load settings.');
        setLoading(false);
      });
  }, []);

  const toggleEnabled = async () => {
    if (!settings) return;
    setToggling(true);
    setError(null);
    try {
      const res = await fetch('/api/inventory/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !settings.enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      } else {
        setError('Failed to update settings.');
      }
    } catch {
      setError('Failed to update settings.');
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12 font-mono">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div className="font-mono">
      <h3 className="text-brown-800 text-sm uppercase tracking-wider mb-6 font-bold">
        Settings
      </h3>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <div className="border-2 border-brown-800 bg-cream-100 p-6 max-w-md">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings?.enabled ?? false}
            onChange={toggleEnabled}
            disabled={toggling}
            className="mt-1 accent-orange-500 w-4 h-4"
          />
          <div>
            <p className="text-brown-800 font-bold uppercase tracking-wide text-sm">
              Inventory System
            </p>
            <p className="text-brown-800/60 text-xs mt-1">
              Enable or disable the inventory system for all users.
            </p>
            <p className="text-xs mt-2">
              Status:{' '}
              <span
                className={`font-bold uppercase ${
                  settings?.enabled ? 'text-orange-500' : 'text-brown-800/50'
                }`}
              >
                {settings?.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
