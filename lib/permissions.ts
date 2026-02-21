import prisma from "@/lib/prisma"
import { Role } from "../app/generated/prisma/client"

export { Role }

export enum Permission {
  MANAGE_ROLES = "MANAGE_ROLES",
  REVIEW_PROJECTS = "REVIEW_PROJECTS",
  REVIEW_SESSIONS = "REVIEW_SESSIONS",
  MANAGE_USERS = "MANAGE_USERS",
  VIEW_AUDIT_LOG = "VIEW_AUDIT_LOG",
  FLAG_FRAUD = "FLAG_FRAUD",
  MANAGE_CURRENCY = "MANAGE_CURRENCY",
}

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.ADMIN]: Object.values(Permission),
  [Role.REVIEWER]: [Permission.REVIEW_PROJECTS, Permission.REVIEW_SESSIONS],
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
