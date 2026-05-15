import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"
import { MAX_PRINT_ALLOWANCE_MINUTES } from "@/lib/inventory/manufacturing"

type BulkTeamAction =
  | "LOCK_TEAMS"
  | "UNLOCK_TEAMS"
  | "SET_PRINT_ALLOWANCE"
  | "RESET_USED_PRINT_ALLOWANCE"
  | "SET_MAX_TEAM_SIZE"

export async function POST(request: Request) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  const { session } = result
  const body = await request.json().catch(() => null)
  const action = body?.action as BulkTeamAction | undefined

  if (
    action !== "LOCK_TEAMS" &&
    action !== "UNLOCK_TEAMS" &&
    action !== "SET_PRINT_ALLOWANCE" &&
    action !== "RESET_USED_PRINT_ALLOWANCE" &&
    action !== "SET_MAX_TEAM_SIZE"
  ) {
    return NextResponse.json({ error: "Invalid team bulk action" }, { status: 400 })
  }

  if (body?.confirm !== true) {
    return NextResponse.json({ error: "Bulk team action requires confirmation" }, { status: 400 })
  }

  if (action === "LOCK_TEAMS" || action === "UNLOCK_TEAMS") {
    const locked = action === "LOCK_TEAMS"
    const affectedTeamIds = await prisma.$transaction(async (tx) => {
      const teams = await tx.team.findMany({ select: { id: true } })
      await tx.team.updateMany({ data: { locked } })
      return teams.map((team) => team.id)
    })
    await logAdminAction(
      AuditAction.INVENTORY_TEAM_LOCK,
      session.user.id,
      session.user.email,
      "TeamBulk",
      action,
      { action, locked, affectedTeamIds }
    )
    return NextResponse.json({ ok: true, action, teamCount: affectedTeamIds.length })
  }

  if (action === "SET_PRINT_ALLOWANCE") {
    const rawAllowanceMinutes = body?.allowanceMinutes
    const allowanceMinutes = Math.round(Number(rawAllowanceMinutes))
    if (
      rawAllowanceMinutes === undefined ||
      rawAllowanceMinutes === null ||
      !Number.isFinite(allowanceMinutes) ||
      allowanceMinutes < 0 ||
      allowanceMinutes > MAX_PRINT_ALLOWANCE_MINUTES
    ) {
      return NextResponse.json(
        { error: `allowanceMinutes must be between 0 and ${MAX_PRINT_ALLOWANCE_MINUTES}` },
        { status: 400 }
      )
    }

    const affectedTeamIds = await prisma.$transaction(async (tx) => {
      const teams = await tx.team.findMany({ select: { id: true } })
      await tx.team.updateMany({
        data: { manufacturingAllowanceMinutes: allowanceMinutes },
      })
      await tx.manufacturingSettings.upsert({
        where: { id: "singleton" },
        update: { defaultAllowanceMinutes: allowanceMinutes },
        create: { id: "singleton", defaultAllowanceMinutes: allowanceMinutes },
      })
      return teams.map((team) => team.id)
    })
    await logAdminAction(
      AuditAction.INVENTORY_SETTINGS_UPDATE,
      session.user.id,
      session.user.email,
      "TeamBulk",
      action,
      { action, allowanceMinutes, affectedTeamIds }
    )
    return NextResponse.json({ ok: true, action, teamCount: affectedTeamIds.length, allowanceMinutes })
  }

  if (action === "SET_MAX_TEAM_SIZE") {
    const rawMaxTeamSize = body?.maxTeamSize
    const maxTeamSize = Math.round(Number(rawMaxTeamSize))
    if (
      rawMaxTeamSize === undefined ||
      rawMaxTeamSize === null ||
      !Number.isFinite(maxTeamSize) ||
      maxTeamSize < 1 ||
      maxTeamSize > 100
    ) {
      return NextResponse.json(
        { error: "maxTeamSize must be between 1 and 100" },
        { status: 400 }
      )
    }

    const affectedTeamIds = await prisma.$transaction(async (tx) => {
      const teams = await tx.team.findMany({ select: { id: true } })
      await tx.inventorySettings.upsert({
        where: { id: "singleton" },
        update: { maxTeamSize },
        create: { id: "singleton", maxTeamSize },
      })
      return teams.map((team) => team.id)
    })
    await logAdminAction(
      AuditAction.INVENTORY_SETTINGS_UPDATE,
      session.user.id,
      session.user.email,
      "TeamBulk",
      action,
      { action, maxTeamSize, affectedTeamIds }
    )
    return NextResponse.json({ ok: true, action, teamCount: affectedTeamIds.length, maxTeamSize })
  }

  const resetAt = new Date()
  const affectedTeamIds = await prisma.$transaction(async (tx) => {
    const teams = await tx.team.findMany({ select: { id: true } })
    await tx.team.updateMany({
      data: { manufacturingAllowanceResetAt: resetAt },
    })
    await tx.manufacturingJob.updateMany({
      where: { teamId: { in: teams.map((team) => team.id) }, status: "READY" },
      data: { completedAt: resetAt },
    })
    return teams.map((team) => team.id)
  })
  await logAdminAction(
    AuditAction.INVENTORY_SETTINGS_UPDATE,
    session.user.id,
    session.user.email,
    "TeamBulk",
    action,
    { action, resetAt: resetAt.toISOString(), affectedTeamIds }
  )

  return NextResponse.json({ ok: true, action, teamCount: affectedTeamIds.length, resetAt: resetAt.toISOString() })
}
