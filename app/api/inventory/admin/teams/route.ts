import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { MAX_TEAM_SIZE } from "@/lib/inventory/config"

export async function GET() {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  const [settings, teams, jobs] = await Promise.all([
    prisma.inventorySettings.findUnique({
      where: { id: "singleton" },
      select: { maxTeamSize: true },
    }),
    prisma.team.findMany({
      include: {
        members: { select: { id: true, name: true, slackDisplayName: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.manufacturingJob.findMany({
      select: {
        teamId: true,
        status: true,
        estimatedMinutes: true,
        completedAt: true,
      },
    }),
  ])

  const stats = new Map<string, { usedMinutes: number; reservedMinutes: number }>()
  const teamsById = new Map(teams.map((team) => [team.id, team]))
  for (const team of teams) {
    stats.set(team.id, { usedMinutes: 0, reservedMinutes: 0 })
  }

  for (const job of jobs) {
    const team = teamsById.get(job.teamId)
    const usage = stats.get(job.teamId)
    if (!team || !usage) continue
    const estimatedMinutes = job.estimatedMinutes ?? 0
    const countedAsUsed =
      (job.status === "READY" || job.status === "COMPLETED") &&
      (!team.manufacturingAllowanceResetAt ||
        (job.completedAt && job.completedAt > team.manufacturingAllowanceResetAt))

    if (countedAsUsed) {
      usage.usedMinutes += estimatedMinutes
    } else if (job.status === "PENDING" || job.status === "TIME_APPROVAL_REQUESTED" || job.status === "QUEUED" || job.status === "PRINTING" || job.status === "READY") {
      usage.reservedMinutes += estimatedMinutes
    }
  }

  return NextResponse.json({
    settings: {
      maxTeamSize: settings?.maxTeamSize ?? MAX_TEAM_SIZE,
    },
    teams: teams.map((team) => ({
      ...team,
      usedPrintAllowanceMinutes: stats.get(team.id)?.usedMinutes ?? 0,
      reservedPrintAllowanceMinutes: stats.get(team.id)?.reservedMinutes ?? 0,
      maxMembers: team.maxMembersOverride ?? settings?.maxTeamSize ?? MAX_TEAM_SIZE,
    })),
  })
}
