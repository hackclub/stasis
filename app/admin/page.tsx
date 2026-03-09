'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminDashboard() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/reviews');
  }, [router]);

  return (
    <div className="text-center py-12">
      <p className="text-brown-800">Redirecting to Review Queue...</p>
    </div>
  );
}
