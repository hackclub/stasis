import prisma from "@/lib/prisma"
import { Role } from "../app/generated/prisma/client"

export { Role }

export enum Permission {
  MANAGE_ROLES = "MANAGE_ROLES",
  REVIEW_PROJECTS = "REVIEW_PROJECTS",
  REVIEW_SESSIONS = "REVIEW_SESSIONS",
  MANAGE_USERS = "MANAGE_USERS",
  VIEW_AUDIT_LOG = "VIEW_AUDIT_LOG",
  VIEW_AUDIT_REVIEWS = "VIEW_AUDIT_REVIEWS",
  FLAG_FRAUD = "FLAG_FRAUD",
  MANAGE_CURRENCY = "MANAGE_CURRENCY",
  VIEW_SIDEKICK_DASHBOARD = "VIEW_SIDEKICK_DASHBOARD",
  MANAGE_ATTENDANCE = "MANAGE_ATTENDANCE",
  INVENTORY_FULFILL = "INVENTORY_FULFILL",
}

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  // ADMIN gets everything *except* MANAGE_ATTENDANCE — that's locked to the
  // small attendance-admin circle (see Role.ATTENDANCE_ADMIN below).
  [Role.ADMIN]: [
    Permission.MANAGE_ROLES,
    Permission.REVIEW_PROJECTS,
    Permission.REVIEW_SESSIONS,
    Permission.MANAGE_USERS,
    Permission.VIEW_AUDIT_LOG,
    Permission.VIEW_AUDIT_REVIEWS,
    Permission.FLAG_FRAUD,
    Permission.MANAGE_CURRENCY,
    Permission.VIEW_SIDEKICK_DASHBOARD,
    Permission.INVENTORY_FULFILL,
  ],
  [Role.INVENTORY_STAFF]: [Permission.INVENTORY_FULFILL],
  [Role.REVIEWER]: [Permission.REVIEW_PROJECTS, Permission.REVIEW_SESSIONS],
  [Role.SIDEKICK]: [Permission.VIEW_SIDEKICK_DASHBOARD],
  [Role.AUDITOR]: [Permission.VIEW_AUDIT_LOG, Permission.VIEW_AUDIT_REVIEWS],
  [Role.ATTENDANCE_ADMIN]: [Permission.MANAGE_ATTENDANCE],
}

export function hasPermission(userRoles: Role[], permission: Permission): boolean {
  return userRoles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission))
}

export function hasRole(userRoles: Role[], role: Role): boolean {
  return userRoles.includes(role)
}

export async function getUserRoles(userId: string): Promise<Role[]> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    select: { role: true },
  })

  return userRoles.map((r) => r.role)
}
