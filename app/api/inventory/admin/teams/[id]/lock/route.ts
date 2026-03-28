import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  const { session } = result
  const { id } = await params

  const existing = await prisma.team.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Team not found" }, { status: 404 })

  const body = await request.json()
  const { locked } = body

  if (typeof locked !== "boolean") {
    return NextResponse.json(
      { error: "locked must be a boolean" },
      { status: 400 }
    )
  }

  const team = await prisma.team.update({
    where: { id },
    data: { locked },
  })

  await logAdminAction(
    AuditAction.INVENTORY_TEAM_LOCK,
    session.user.id,
    session.user.email,
    "Team",
    id,
    { locked, teamName: existing.name }
  )

  return NextResponse.json({ id: team.id, locked: team.locked })
}
