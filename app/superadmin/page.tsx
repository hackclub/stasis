'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SuperAdminPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const router = useRouter();

  async function grantAdmin() {
    setStatus('loading');
    try {
      const res = await fetch('/api/superadmin', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setStatus('success');
        setMessage('Admin access granted! Redirecting...');
        setTimeout(() => router.push('/admin'), 1500);
      } else {
        setStatus('error');
        setMessage(data.error || 'Failed to grant admin access');
      }
    } catch {
      setStatus('error');
      setMessage('Network error');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream-100">
      <div className="bg-cream-200 p-8 rounded border border-brand-500">
        <h1 className="text-brand-500 text-xl uppercase tracking-wide mb-4">Superadmin Access</h1>
        {status === 'idle' && (
          <button
            onClick={grantAdmin}
            className="bg-brand-500 text-cream-100 px-4 py-2 uppercase tracking-wide hover:bg-brand-600"
          >
            Grant Admin Access
          </button>
        )}
        {status === 'loading' && <p>Granting access...</p>}
        {status === 'success' && <p className="text-green-600">{message}</p>}
        {status === 'error' && <p className="text-red-600">{message}</p>}
      </div>
    </div>
  );
}
