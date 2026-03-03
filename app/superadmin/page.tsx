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
    <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)]">
      <div className="bg-cream-100 p-8 border border-orange-500">
        <h1 className="text-orange-500 text-xl uppercase tracking-wide mb-4">Superadmin Access</h1>
        {status === 'idle' && (
          <button
            onClick={grantAdmin}
            className="bg-orange-500 text-cream-100 px-4 py-2 uppercase tracking-wide hover:bg-orange-600"
          >
            Grant Admin Access
          </button>
        )}
        {status === 'loading' && <p className="text-brown-800">Granting access...</p>}
        {status === 'success' && <p className="text-green-500">{message}</p>}
        {status === 'error' && <p className="text-red-600">{message}</p>}
      </div>
    </div>
  );
}
