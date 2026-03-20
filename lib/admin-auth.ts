import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { getUserRoles, hasPermission, hasRole, Permission, Role } from "@/lib/permissions"

export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() })
  
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const roles = await getUserRoles(session.user.id)

  if (!hasRole(roles, Role.ADMIN)) {
    return { error: NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 }) }
  }

  return { session, roles }
}

export async function requirePermission(permission: Permission) {
  const session = await auth.api.getSession({ headers: await headers() })
  
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const roles = await getUserRoles(session.user.id)

  if (!hasPermission(roles, permission)) {
    return { error: NextResponse.json({ error: `Forbidden: ${permission} permission required` }, { status: 403 }) }
  }

  return { session, roles }
}

export async function requireAnyPermission(...permissions: Permission[]) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const roles = await getUserRoles(session.user.id)

  if (!permissions.some(p => hasPermission(roles, p))) {
    return { error: NextResponse.json({ error: `Forbidden: One of ${permissions.join(", ")} permissions required` }, { status: 403 }) }
  }

  return { session, roles }
}

export async function requireRole(role: Role) {
  const session = await auth.api.getSession({ headers: await headers() })
  
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const roles = await getUserRoles(session.user.id)

  if (!hasRole(roles, role)) {
    return { error: NextResponse.json({ error: `Forbidden: ${role} role required` }, { status: 403 }) }
  }

  return { session, roles }
}
