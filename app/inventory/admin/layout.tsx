'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useInventoryAccess } from '../InventoryAccessContext';

export default function AdminInventoryLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const access = useInventoryAccess();
  const isAdmin = access?.isAdmin ?? false;

  const tabs = [
    { label: 'Activity', href: '/inventory/admin' },
    { label: 'Inventory', href: '/inventory/admin/items' },
    { label: 'Teams', href: '/inventory/admin/teams' },
    { label: 'Settings', href: '/inventory/admin/settings' },
  ];

  const getTabClass = (href: string) => {
    const isActive =
      href === '/inventory/admin'
        ? pathname === '/inventory/admin'
        : pathname.startsWith(href);

    return `relative z-10 px-4 py-2 text-sm uppercase tracking-wider transition-colors border-b-2 -mb-[2px] ${
      isActive
        ? 'text-orange-500 border-orange-500'
        : 'text-brown-800 border-transparent hover:text-orange-500'
    }`;
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-20 font-mono">
        <div className="text-center">
          <h2 className="text-brown-800 text-xl uppercase tracking-wide mb-4">
            Access Denied
          </h2>
          <p className="text-brown-800/70">
            You do not have permission to access the admin panel.
          </p>
          <Link
            href="/inventory"
            className="inline-block mt-6 bg-orange-500 text-cream-50 px-4 py-2 hover:bg-orange-600 transition-colors uppercase text-sm tracking-wider"
          >
            Back to Inventory
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="font-mono">
      {/* Admin sub-tabs */}
      <div className="border-b-2 border-brown-800 mb-6">
        <div className="flex gap-0">
          {tabs.map((tab) => (
            <Link key={tab.href} href={tab.href} className={getTabClass(tab.href)}>
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {children}
    </div>
  );
}
