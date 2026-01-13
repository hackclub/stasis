'use client';

import { useSession } from "@/lib/auth-client";
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface User {
  isAdmin: boolean;
}

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAdmin() {
      if (!session) {
        if (!isPending) {
          router.push('/dashboard');
        }
        return;
      }

      try {
        const res = await fetch('/api/user');
        if (res.ok) {
          const user: User = await res.json();
          if (!user.isAdmin) {
            router.push('/dashboard');
          } else {
            setIsAdmin(true);
          }
        } else {
          router.push('/dashboard');
        }
      } catch {
        router.push('/dashboard');
      } finally {
        setLoading(false);
      }
    }

    checkAdmin();
  }, [session, isPending, router]);

  if (isPending || loading || isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-950 font-mono">
        <p className="text-cream-500">Loading...</p>
      </div>
    );
  }

  return <>{children}</>;
}
