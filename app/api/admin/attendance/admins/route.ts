import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission, Role } from "@/lib/permissions"

/**
 * GET /api/admin/attendance/admins
 * List of admin users (for the owner picker in the dashboard).
 */
export async function GET() {
  const authCheck = await requirePermission(Permission.MANAGE_ATTENDANCE)
  if (authCheck.error) return authCheck.error

  // Only attendance admins are eligible to be owners — they're the people who
  // can actually act on candidates in this dashboard.
  const admins = await prisma.user.findMany({
    where: { roles: { some: { role: Role.ATTENDANCE_ADMIN } }, fraudConvicted: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, image: true },
  })
  return NextResponse.json({ items: admins })
}
