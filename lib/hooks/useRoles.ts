'use client';

import { useState, useEffect, useCallback } from 'react';

export enum Role {
  ADMIN = "ADMIN",
  REVIEWER = "REVIEWER",
  SIDEKICK = "SIDEKICK",
}

export enum Permission {
  MANAGE_ROLES = "MANAGE_ROLES",
  REVIEW_PROJECTS = "REVIEW_PROJECTS",
  REVIEW_SESSIONS = "REVIEW_SESSIONS",
  MANAGE_USERS = "MANAGE_USERS",
  VIEW_AUDIT_LOG = "VIEW_AUDIT_LOG",
  FLAG_FRAUD = "FLAG_FRAUD",
  MANAGE_CURRENCY = "MANAGE_CURRENCY",
  VIEW_SIDEKICK_DASHBOARD = "VIEW_SIDEKICK_DASHBOARD",
}

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.ADMIN]: Object.values(Permission),
  [Role.REVIEWER]: [Permission.REVIEW_PROJECTS, Permission.REVIEW_SESSIONS],
  [Role.SIDEKICK]: [Permission.VIEW_SIDEKICK_DASHBOARD],
};

interface UseRolesReturn {
  roles: Role[];
  isLoading: boolean;
  hasRole: (role: Role) => boolean;
  hasPermission: (permission: Permission) => boolean;
}

export function useRoles(): UseRolesReturn {
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchRoles() {
      try {
        const res = await fetch('/api/user/roles');
        if (res.ok) {
          const data = await res.json();
          setRoles(data.roles as Role[]);
        }
      } catch {
        setRoles([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchRoles();
  }, []);

  const hasRole = useCallback(
    (role: Role): boolean => roles.includes(role),
    [roles]
  );

  const hasPermission = useCallback(
    (permission: Permission): boolean =>
      roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission)),
    [roles]
  );

  return { roles, isLoading, hasRole, hasPermission };
}
