'use client';

import { createContext, useContext } from 'react';

export interface AccessInfo {
  allowed: boolean;
  reason?: string;
  isAdmin: boolean;
  teamId?: string;
  teamName?: string;
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
