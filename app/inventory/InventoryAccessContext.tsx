'use client';

import { createContext, useContext } from 'react';

export interface AccessInfo {
  allowed: boolean;
  reason?: string | null;
  isAdmin: boolean;
  teamId?: string | null;
  teamName?: string | null;
  venueFloors?: number;
  maxConcurrentRentals?: number;
  allowMultipleOrders?: boolean;
}

const InventoryAccessContext = createContext<AccessInfo | null>(null);

export function InventoryAccessProvider({
  value,
  children,
}: {
  value: AccessInfo;
  children: React.ReactNode;
}) {
  return (
    <InventoryAccessContext.Provider value={value}>
      {children}
    </InventoryAccessContext.Provider>
  );
}

export function useInventoryAccess() {
  return useContext(InventoryAccessContext);
}
