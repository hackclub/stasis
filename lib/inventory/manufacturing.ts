import prisma from "@/lib/prisma"
import { sanitize } from "@/lib/sanitize"
import {
  ManufacturingJobStatus,
  ManufacturingPrinterStatus,
  Prisma,
} from "@/app/generated/prisma/client"

export const DEFAULT_ALLOWANCE_MINUTES = 240
export const DEFAULT_WARNING_LONG_PRINT_MINUTES = 240
export const MAX_PRINT_ALLOWANCE_MINUTES = 30 * 24 * 60
const MAX_SHORT_TEXT = 160
const MAX_LONG_TEXT = 2000

export const ACTIVE_RESERVE_STATUSES: ManufacturingJobStatus[] = [
  "PENDING",
  "TIME_APPROVAL_REQUESTED",
  "QUEUED",
  "PRINTING",
  "READY",
]

export const OPEN_JOB_STATUSES: ManufacturingJobStatus[] = [
  "QUEUED",
]

export const ACTIVE_JOB_STATUSES: ManufacturingJobStatus[] = [
  "PRINTING",
]

export const REJECTED_JOB_STATUSES: ManufacturingJobStatus[] = [
  "TIME_REJECTED_BY_TEAM",
  "REJECTED",
  "REJECTED_BY_ORGANIZER",
  "REJECTED_BY_PRINTER",
  "CANCELLED",
]

const JOB_STATUS_VALUES = new Set<string>(Object.values(ManufacturingJobStatus))
const PRINTER_STATUS_VALUES = new Set<string>(Object.values(ManufacturingPrinterStatus))

type Tx = Prisma.TransactionClient

type ManufacturingStateOptions = {
  includeAll?: boolean
}

type JobWithRelations = Prisma.ManufacturingJobGetPayload<{
  include: {
    team: {
      select: {
        id: true
        name: true
        manufacturingAllowanceMinutes: true
        manufacturingAllowanceResetAt: true
        manufacturingAutoApprovePrints: true
      }
    }
    submittedBy: {
      select: {
        id: true
        name: true
        slackDisplayName: true
        image: true
      }
    }
    assignedPrinter: { select: { id: true; name: true; status: true } }
  }
}>

function cleanText(value: unknown, maxLength = MAX_SHORT_TEXT): string {
  if (typeof value !== "string") return ""
  return sanitize(value).trim().slice(0, maxLength)
}

function cleanNullableText(value: unknown, maxLength = MAX_LONG_TEXT): string | null {
  const cleaned = cleanText(value, maxLength)
  return cleaned.length > 0 ? cleaned : null
}

function readOptionalPositiveMinutes(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null
  const parsed = Math.round(Number(value))
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("estimatedMinutes must be greater than 0.")
  }
  return Math.min(parsed, 7 * 24 * 60)
}

function readNonNegativeInt(value: unknown, fallback = 0, max = 100): number {
  const parsed = Math.round(Number(value))
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.min(parsed, max)
}

function readAllowanceMinutes(value: unknown): number {
  const parsed = Math.round(Number(value))
  if (
    value === undefined ||
    value === null ||
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    parsed > MAX_PRINT_ALLOWANCE_MINUTES
  ) {
    throw new Error(`allowanceMinutes must be between 0 and ${MAX_PRINT_ALLOWANCE_MINUTES}.`)
  }
  return parsed
}

function readMaxMembersOverride(value: unknown): number | null {
  if (value === undefined || value === "" || value === null) return null
  const parsed = Math.round(Number(value))
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) {
    throw new Error("maxMembersOverride must be between 1 and 100.")
  }
  return parsed
}

function readJobStatus(value: unknown, fallback?: ManufacturingJobStatus): ManufacturingJobStatus {
  if (typeof value !== "string") {
    if (fallback) return fallback
    throw new Error("Status is required.")
  }
  const status = value.toUpperCase()
  if (!JOB_STATUS_VALUES.has(status)) {
    throw new Error(`Invalid status: ${value}`)
  }
  return status as ManufacturingJobStatus
}

function readPrinterStatus(value: unknown, fallback: ManufacturingPrinterStatus): ManufacturingPrinterStatus {
  if (typeof value !== "string") return fallback
  const status = value.toUpperCase()
  return PRINTER_STATUS_VALUES.has(status) ? (status as ManufacturingPrinterStatus) : fallback
}

function toIso(date: Date | null): string | null {
  return date ? date.toISOString() : null
}

function slackHandle(user: JobWithRelations["submittedBy"]): string {
  if (user.slackDisplayName) {
    return user.slackDisplayName.startsWith("@")
      ? user.slackDisplayName
      : `@${user.slackDisplayName}`
  }
  return ""
}

function jobToDto(job: JobWithRelations) {
  return {
    id: job.id,
    teamId: job.teamId,
    teamName: job.team.name,
    slackHandle: slackHandle(job.submittedBy),
    submittedBy: {
      id: job.submittedBy.id,
      name: job.submittedBy.name,
      slackDisplayName: job.submittedBy.slackDisplayName,
      image: job.submittedBy.image,
    },
    teamAutoApprovePrints: job.team.manufacturingAutoApprovePrints,
    projectName: job.projectName,
    description: job.description,
    estimatedMinutes: job.estimatedMinutes,
    material: job.material,
    colour: job.colour,
    fileLink: job.fileLink ?? "",
    notes: job.notes ?? "",
    status: job.status,
    assignedPrinterId: job.assignedPrinterId,
    assignedPrinter: job.assignedPrinter,
    submittedAt: job.submittedAt.toISOString(),
    startedAt: toIso(job.startedAt),
    completedAt: toIso(job.completedAt),
    collectedAt: toIso(job.collectedAt),
    dismissedAt: toIso(job.dismissedAt),
    timeEstimateRequestedAt: toIso(job.timeEstimateRequestedAt),
    timeApprovedAt: toIso(job.timeApprovedAt),
    timeRejectedAt: toIso(job.timeRejectedAt),
    overBudgetApprovedAt: toIso(job.overBudgetApprovedAt),
    staffNotes: job.staffNotes ?? "",
    urgent: job.urgent,
    priority: job.priority,
  }
}

async function teamUsage(tx: Tx, teamId: string, resetAt: Date | null) {
  const jobs = await tx.manufacturingJob.findMany({
    where: {
      teamId,
      status: { in: ["PENDING", "TIME_APPROVAL_REQUESTED", "QUEUED", "PRINTING", "READY", "COMPLETED"] },
    },
    select: { status: true, estimatedMinutes: true, completedAt: true },
  })

  let reservedMinutes = 0
  let usedMinutes = 0
  for (const job of jobs) {
    const minutes = job.estimatedMinutes ?? 0
    const countedAsUsed =
      (job.status === "READY" || job.status === "COMPLETED") &&
      (!resetAt || Boolean(job.completedAt && job.completedAt > resetAt))

    if (countedAsUsed) {
      usedMinutes += minutes
    } else if (ACTIVE_RESERVE_STATUSES.includes(job.status)) {
      reservedMinutes += minutes
    }
  }

  return { reservedMinutes, usedMinutes }
}

export async function readManufacturingState(
  currentUserId?: string,
  options: ManufacturingStateOptions = {}
) {
  const [settingsRecord, printers, currentUser] = await Promise.all([
    prisma.manufacturingSettings.findUnique({ where: { id: "singleton" } }),
    prisma.manufacturingPrinter.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    currentUserId
      ? prisma.user.findUnique({
          where: { id: currentUserId },
          select: {
            id: true,
            name: true,
            email: true,
            slackDisplayName: true,
            image: true,
            teamId: true,
            team: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve(null),
  ])

  const includeAll = options.includeAll === true
  const visibleTeamId = includeAll ? null : currentUser?.teamId ?? null
  const noVisibleRows = { id: "__no_visible_rows__" }
  const jobWhere: Prisma.ManufacturingJobWhereInput = includeAll
    ? {}
    : visibleTeamId
      ? { teamId: visibleTeamId }
      : noVisibleRows
  const teamWhere: Prisma.TeamWhereInput = includeAll
    ? {}
    : visibleTeamId
      ? { id: visibleTeamId }
      : noVisibleRows

  const [jobs, teams] = await Promise.all([
    prisma.manufacturingJob.findMany({
      where: jobWhere,
      include: {
        team: {
          select: {
            id: true,
            name: true,
            manufacturingAllowanceMinutes: true,
            manufacturingAllowanceResetAt: true,
            manufacturingAutoApprovePrints: true,
          },
        },
        submittedBy: {
          select: {
            id: true,
            name: true,
            slackDisplayName: true,
            image: true,
          },
        },
        assignedPrinter: { select: { id: true, name: true, status: true } },
      },
      orderBy: [{ priority: "desc" }, { submittedAt: "asc" }],
    }),
    prisma.team.findMany({
      where: teamWhere,
      select: {
        id: true,
        name: true,
        locked: true,
        manufacturingAllowanceMinutes: true,
        manufacturingAllowanceResetAt: true,
        manufacturingAutoApprovePrints: true,
        _count: { select: { members: true } },
      },
      orderBy: { name: "asc" },
    }),
  ])

  const settings = {
    defaultAllowanceMinutes: settingsRecord?.defaultAllowanceMinutes ?? DEFAULT_ALLOWANCE_MINUTES,
    warningLongPrintMinutes: settingsRecord?.warningLongPrintMinutes ?? DEFAULT_WARNING_LONG_PRINT_MINUTES,
    eventName: settingsRecord?.eventName ?? "Stasis",
  }

  const teamStats = new Map<
    string,
    {
      usedMinutes: number
      reservedMinutes: number
      jobsSubmitted: number
      jobsCompleted: number
    }
  >()

  for (const team of teams) {
    teamStats.set(team.id, {
      usedMinutes: 0,
      reservedMinutes: 0,
      jobsSubmitted: 0,
      jobsCompleted: 0,
    })
  }

  const teamResetTimes = new Map(
    teams.map((team) => [team.id, team.manufacturingAllowanceResetAt])
  )

  for (const job of jobs) {
    const stats = teamStats.get(job.teamId)
    if (!stats) continue
    stats.jobsSubmitted += 1
    const estimatedMinutes = job.estimatedMinutes ?? 0
    const resetAt = teamResetTimes.get(job.teamId) ?? null
    const countedAsUsed =
      (job.status === "READY" || job.status === "COMPLETED") &&
      (!resetAt || (job.completedAt && job.completedAt > resetAt))

    if (countedAsUsed) {
      stats.usedMinutes += estimatedMinutes
      stats.jobsCompleted += 1
    } else if (ACTIVE_RESERVE_STATUSES.includes(job.status)) {
      stats.reservedMinutes += estimatedMinutes
    }
  }

  const teamDtos = teams.map((team) => {
    const stats = teamStats.get(team.id) ?? {
      usedMinutes: 0,
      reservedMinutes: 0,
      jobsSubmitted: 0,
      jobsCompleted: 0,
    }

    return {
      id: team.id,
      name: team.name,
      locked: team.locked,
      allowanceMinutes: team.manufacturingAllowanceMinutes,
      usedMinutes: stats.usedMinutes,
      reservedMinutes: stats.reservedMinutes,
      jobsSubmitted: stats.jobsSubmitted,
      jobsCompleted: stats.jobsCompleted,
      memberCount: team._count.members,
      autoApprovePrints: team.manufacturingAutoApprovePrints,
    }
  })

  const queuedJobs = jobs.filter((job) => OPEN_JOB_STATUSES.includes(job.status))
  const queuedMinutes = queuedJobs.reduce((sum, job) => sum + (job.estimatedMinutes ?? 0), 0)
  const activePrinters = printers.filter(
    (printer) =>
      printer.status !== "OFFLINE" &&
      printer.status !== "MAINTENANCE"
  ).length
  const usedMinutes = teamDtos.reduce((sum, team) => sum + team.usedMinutes, 0)
  const reservedMinutes = teamDtos.reduce((sum, team) => sum + team.reservedMinutes, 0)
  const remainingAllowanceMinutes = teamDtos.reduce(
    (sum, team) =>
      sum +
      Math.max(0, team.allowanceMinutes - team.usedMinutes - team.reservedMinutes),
    0
  )
  const printerCapacityWindowMinutes = Math.max(1, settings.defaultAllowanceMinutes)
  const pressureRatio = activePrinters === 0
    ? 1
    : queuedMinutes / (activePrinters * printerCapacityWindowMinutes)
  const longestWaitingJob = [...queuedJobs].sort(
    (a, b) => a.submittedAt.getTime() - b.submittedAt.getTime()
  )[0] ?? null
  const longestPrintJob = [...jobs].sort(
    (a, b) => (b.estimatedMinutes ?? 0) - (a.estimatedMinutes ?? 0)
  )[0] ?? null

  return {
    printers: printers.map((printer) => ({
      id: printer.id,
      name: printer.name,
      status: printer.status,
      currentJobId: printer.currentJobId,
      notes: printer.notes,
      lastCompletedJobId: printer.lastCompletedJobId,
      sortOrder: printer.sortOrder,
    })),
    jobs: jobs.map(jobToDto),
    teams: teamDtos,
    settings,
    summary: {
      activePrinters,
      totalQueuedJobs: queuedJobs.length,
      avgWaitMinutes:
        activePrinters === 0
          ? queuedMinutes
          : Math.round(queuedMinutes / Math.max(1, activePrinters)),
      usedMinutes,
      reservedMinutes,
      remainingAllowanceMinutes,
      queuePressure:
        pressureRatio > 1.2 ? "high" : pressureRatio > 0.6 ? "medium" : "low",
      longestWaitingJobId: longestWaitingJob?.id ?? null,
      longestPrintJobId: longestPrintJob?.id ?? null,
      teamsCloseToLimit: teamDtos
        .filter(
          (team) =>
            team.allowanceMinutes > 0 &&
            (team.usedMinutes + team.reservedMinutes) / team.allowanceMinutes >= 0.85
        )
        .map((team) => team.id),
    },
    currentUser: currentUser
      ? {
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
          slackDisplayName: currentUser.slackDisplayName,
          image: currentUser.image,
          teamId: currentUser.teamId,
          teamName: currentUser.team?.name ?? null,
        }
      : null,
    updatedAt: new Date().toISOString(),
  }
}

export async function createManufacturingJob(
  submittedById: string,
  input: Record<string, unknown>,
  staffOverride = false
) {
  return prisma.$transaction(async (tx) => {
    const submittedBy = await tx.user.findUnique({
      where: { id: submittedById },
      select: { id: true, teamId: true },
    })
    if (!submittedBy) throw new Error("User not found.")

    const teamId = staffOverride
      ? cleanText(input.teamId)
      : submittedBy.teamId

    if (!teamId) throw new Error("You must be on a team to submit a print job.")

    const team = await tx.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        name: true,
        locked: true,
        manufacturingAllowanceMinutes: true,
        manufacturingAllowanceResetAt: true,
      },
    })
    if (!team) throw new Error("Team not found.")
    if (team.locked && !staffOverride) {
      throw new Error("Your team is locked and cannot request print jobs.")
    }

    const projectName = cleanText(input.projectName)
    const description = cleanText(input.description, MAX_LONG_TEXT)
    const estimatedMinutes = staffOverride
      ? readOptionalPositiveMinutes(input.estimatedMinutes)
      : null
    if (!projectName) throw new Error("Project name is required.")
    if (!description) throw new Error("Short description is required.")

    const assignedPrinterId = staffOverride
      ? cleanNullableText(input.assignedPrinterId, MAX_SHORT_TEXT)
      : null
    if (assignedPrinterId) {
      const printer = await tx.manufacturingPrinter.findUnique({
        where: { id: assignedPrinterId },
        select: { id: true },
      })
      if (!printer) throw new Error("Printer not found.")
    }

    let status = staffOverride
      ? readJobStatus(input.status, "PENDING")
      : "PENDING"
    if (status === "PRINTING" && !assignedPrinterId) status = "QUEUED"
    if ((status === "TIME_APPROVAL_REQUESTED" || status === "PRINTING") && !estimatedMinutes) {
      throw new Error("Estimated print time is required before starting.")
    }

    const job = await tx.manufacturingJob.create({
      data: {
        teamId: team.id,
        submittedById,
        projectName,
        description,
        estimatedMinutes,
        material: cleanText(input.material) || "PLA",
        colour: cleanText(input.colour) || "Any",
        fileLink: cleanNullableText(input.fileLink),
        notes: cleanNullableText(input.notes),
        staffNotes: staffOverride ? cleanNullableText(input.staffNotes) : null,
        urgent: Boolean(input.urgent),
        priority: staffOverride ? Boolean(input.priority) : false,
        status,
        assignedPrinterId,
        timeEstimateRequestedAt: status === "TIME_APPROVAL_REQUESTED" ? new Date() : null,
        timeApprovedAt: status === "PRINTING" ? new Date() : null,
        overBudgetApprovedAt: Boolean(input.forceOverBudget) ? new Date() : null,
      },
    })

    if (estimatedMinutes && ACTIVE_RESERVE_STATUSES.includes(status)) {
      const usage = await teamUsage(tx, team.id, team.manufacturingAllowanceResetAt)
      if (usage.usedMinutes + usage.reservedMinutes > team.manufacturingAllowanceMinutes && !Boolean(input.forceOverBudget)) {
        throw new Error("Estimated print time exceeds remaining allowance. Ask an organizer for an override.")
      }
    }

    return job
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function updateManufacturingJob(
  jobId: string,
  input: Record<string, unknown>
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.manufacturingJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        teamId: true,
        assignedPrinterId: true,
        estimatedMinutes: true,
        startedAt: true,
        completedAt: true,
        timeApprovedAt: true,
        status: true,
        overBudgetApprovedAt: true,
        team: {
          select: {
            manufacturingAllowanceMinutes: true,
            manufacturingAllowanceResetAt: true,
            manufacturingAutoApprovePrints: true,
          },
        },
      },
    })
    if (!existing) throw new Error("Job not found.")
    if (input.expectedTeamId !== undefined && existing.teamId !== cleanText(input.expectedTeamId)) {
      throw new Error("Job not found.")
    }
    if (input.expectedStatus !== undefined && existing.status !== readJobStatus(input.expectedStatus)) {
      throw new Error("Already updated")
    }

    const data: Prisma.ManufacturingJobUncheckedUpdateInput = {}
    let assignedPrinterId = existing.assignedPrinterId
    let nextEstimatedMinutes = existing.estimatedMinutes
    let nextStatus = existing.status

    if (input.markCollected && input.status !== undefined) {
      throw new Error("markCollected cannot be combined with a status update.")
    }

    if (input.projectName !== undefined) {
      const projectName = cleanText(input.projectName)
      if (!projectName) throw new Error("Project name is required.")
      data.projectName = projectName
    }
    if (input.description !== undefined) data.description = cleanText(input.description, MAX_LONG_TEXT)
    if (input.estimatedMinutes !== undefined) {
      nextEstimatedMinutes = readOptionalPositiveMinutes(input.estimatedMinutes)
      data.estimatedMinutes = nextEstimatedMinutes
    }
    if (input.material !== undefined) data.material = cleanText(input.material) || "PLA"
    if (input.colour !== undefined) data.colour = cleanText(input.colour) || "Any"
    if (input.fileLink !== undefined) data.fileLink = cleanNullableText(input.fileLink)
    if (input.notes !== undefined) data.notes = cleanNullableText(input.notes)
    if (input.staffNotes !== undefined) data.staffNotes = cleanNullableText(input.staffNotes)
    if (input.urgent !== undefined) data.urgent = Boolean(input.urgent)
    if (input.priority !== undefined) data.priority = Boolean(input.priority)

    if (input.assignedPrinterId !== undefined) {
      assignedPrinterId = cleanNullableText(input.assignedPrinterId, MAX_SHORT_TEXT)
      if (assignedPrinterId) {
        const printer = await tx.manufacturingPrinter.findUnique({
          where: { id: assignedPrinterId },
          select: { id: true },
        })
        if (!printer) throw new Error("Printer not found.")
      }
      data.assignedPrinterId = assignedPrinterId
    }

    if (input.markCollected) {
      data.collectedAt = new Date()
      data.status = "COMPLETED"
      nextStatus = "COMPLETED"
    }
    if (input.markUncollected) {
      data.collectedAt = null
    }

    if (input.status !== undefined) {
      nextStatus = readJobStatus(input.status, existing.status)
      if (nextStatus === "TIME_APPROVAL_REQUESTED" && existing.team.manufacturingAutoApprovePrints) {
        nextStatus = "QUEUED"
      }
      if (
        (nextStatus === "TIME_APPROVAL_REQUESTED" || nextStatus === "PRINTING") &&
        !nextEstimatedMinutes
      ) {
        throw new Error("Estimated print time is required before starting.")
      }
      if (nextStatus === "PRINTING" && !assignedPrinterId) {
        throw new Error("Assign a printer before starting a print.")
      }
      if (nextStatus === "PRINTING" && assignedPrinterId) {
        const printer = await tx.manufacturingPrinter.findUnique({
          where: { id: assignedPrinterId },
          select: { id: true, status: true, currentJobId: true },
        })
        if (!printer) throw new Error("Printer not found.")
        if (printer.status === "MAINTENANCE" || printer.status === "OFFLINE" || printer.status === "PAUSED") {
          throw new Error("Printer is not available.")
        }
        if (printer.status === "PRINTING" && printer.currentJobId !== jobId) {
          throw new Error("Printer is already printing.")
        }
      }

      data.status = nextStatus

      if (nextStatus === "TIME_APPROVAL_REQUESTED") {
        data.timeEstimateRequestedAt = new Date()
        data.timeRejectedAt = null
        data.timeApprovedAt = null
        data.assignedPrinterId = null
        assignedPrinterId = null
      }

      if (nextStatus === "TIME_REJECTED_BY_TEAM") {
        data.timeRejectedAt = new Date()
        data.assignedPrinterId = null
        assignedPrinterId = null
      }

      if (nextStatus === "QUEUED") {
        data.assignedPrinterId = null
        if (existing.status === "TIME_APPROVAL_REQUESTED") {
          data.timeApprovedAt = new Date()
        }
        data.timeRejectedAt = null
        if (Boolean(input.forceOverBudget)) data.overBudgetApprovedAt = new Date()
        assignedPrinterId = null
      }

      if (nextStatus === "PRINTING" && assignedPrinterId) {
        data.startedAt = existing.startedAt ?? new Date()
        data.timeApprovedAt = existing.timeApprovedAt ?? new Date()
        if (Boolean(input.forceOverBudget)) data.overBudgetApprovedAt = new Date()
        await tx.manufacturingPrinter.updateMany({
          where: { currentJobId: jobId, id: { not: assignedPrinterId } },
          data: {
            currentJobId: null,
            status: "AVAILABLE",
          },
        })
        const printerUpdate = await tx.manufacturingPrinter.updateMany({
          where: {
            id: assignedPrinterId,
            status: { notIn: ["MAINTENANCE", "OFFLINE", "PAUSED"] },
            OR: [{ currentJobId: null }, { currentJobId: jobId }],
          },
          data: {
            status: "PRINTING",
            currentJobId: jobId,
          },
        })
        if (printerUpdate.count !== 1) {
          throw new Error("Printer is not available.")
        }
      }

      if (nextStatus === "READY" || nextStatus === "COMPLETED") {
        data.completedAt = existing.completedAt ?? new Date()
        data.collectedAt = nextStatus === "COMPLETED" ? new Date() : null
        await tx.manufacturingPrinter.updateMany({
          where: {
            OR: [
              { currentJobId: jobId },
              ...(assignedPrinterId ? [{ id: assignedPrinterId }] : []),
            ],
          },
          data: {
            status: "AVAILABLE",
            currentJobId: null,
            lastCompletedJobId: jobId,
          },
        })
      }

      if (REJECTED_JOB_STATUSES.includes(nextStatus)) {
        data.collectedAt = null
        data.assignedPrinterId = null
        assignedPrinterId = null
        const reason = cleanNullableText(input.rejectReason ?? input.reason ?? input.staffNotes)
        if (reason) data.staffNotes = reason
        await tx.manufacturingPrinter.updateMany({
          where: { currentJobId: jobId },
          data: {
            status: "AVAILABLE",
            currentJobId: null,
          },
        })
      }
    }

    return tx.manufacturingJob.update({
      where: { id: jobId },
      data,
    })
      .then(async (updated) => {
        if (
          nextEstimatedMinutes &&
          (ACTIVE_RESERVE_STATUSES.includes(updated.status) || updated.status === "COMPLETED")
        ) {
          const usage = await teamUsage(tx, existing.teamId, existing.team.manufacturingAllowanceResetAt)
          const overBudget = usage.usedMinutes + usage.reservedMinutes > existing.team.manufacturingAllowanceMinutes
          if (overBudget && !Boolean(input.forceOverBudget) && !updated.overBudgetApprovedAt) {
            throw new Error("Estimated print time exceeds remaining allowance. Ask an organizer for an override.")
          }
          if (overBudget && !updated.overBudgetApprovedAt) {
            return tx.manufacturingJob.update({
              where: { id: jobId },
              data: { overBudgetApprovedAt: new Date() },
            })
          }
        }
        return updated
      })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function deleteManufacturingJob(jobId: string) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.manufacturingJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    })
    if (!existing) throw new Error("Job not found.")
    const deletableStatuses: ManufacturingJobStatus[] = [
      "PENDING",
      "COMPLETED",
      ...REJECTED_JOB_STATUSES,
    ]
    if (!deletableStatuses.includes(existing.status)) {
      throw new Error("Only pending, completed, cancelled, or rejected print jobs can be deleted.")
    }

    await tx.manufacturingPrinter.updateMany({
      where: { currentJobId: jobId },
      data: {
        currentJobId: null,
        status: "AVAILABLE",
      },
    })
    await tx.manufacturingJob.delete({ where: { id: jobId } })
  })
}

export async function listManufacturingPrinters() {
  return prisma.manufacturingPrinter.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  })
}

export async function createManufacturingPrinter(input: Record<string, unknown>) {
  const name = cleanText(input.name)
  if (!name) throw new Error("Printer name is required.")

  const fallbackSortOrder = await prisma.manufacturingPrinter.count()
  const sortOrder = input.sortOrder === undefined || input.sortOrder === ""
    ? fallbackSortOrder
    : readNonNegativeInt(input.sortOrder, fallbackSortOrder, 1000)

  return prisma.manufacturingPrinter.create({
    data: {
      name,
      status: readPrinterStatus(input.status, "AVAILABLE"),
      notes: cleanText(input.notes, MAX_LONG_TEXT),
      sortOrder,
    },
  })
}

export async function updateManufacturingPrinter(
  printerId: string,
  input: Record<string, unknown>
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.manufacturingPrinter.findUnique({
      where: { id: printerId },
      select: {
        id: true,
        currentJobId: true,
        status: true,
      },
    })
    if (!existing) throw new Error("Printer not found.")

    const data: Prisma.ManufacturingPrinterUncheckedUpdateInput = {}
    if (input.name !== undefined) {
      const name = cleanText(input.name)
      if (!name) throw new Error("Printer name is required.")
      data.name = name
    }
    if (input.status !== undefined) {
      data.status = readPrinterStatus(input.status, "AVAILABLE")
    }
    if (input.currentJobId !== undefined) {
      data.currentJobId = cleanNullableText(input.currentJobId, MAX_SHORT_TEXT)
    }
    if (input.notes !== undefined) {
      data.notes = cleanText(input.notes, MAX_LONG_TEXT)
    }
    if (input.sortOrder !== undefined) {
      data.sortOrder = readNonNegativeInt(input.sortOrder, 0, 1000)
    }

    const requestedStatus = data.status as ManufacturingPrinterStatus | undefined
    const requestedCurrentJobId = data.currentJobId !== undefined
      ? (data.currentJobId as string | null)
      : existing.currentJobId

    if (input.completeCurrent && (input.status !== undefined || input.currentJobId !== undefined)) {
      throw new Error("completeCurrent cannot be combined with direct printer status changes.")
    }
    if (input.currentJobId !== undefined && requestedCurrentJobId !== existing.currentJobId) {
      throw new Error("Use queue controls to assign or clear a printer job.")
    }
    if (requestedStatus !== undefined) {
      if (requestedStatus === "PRINTING" && !existing.currentJobId && !input.assignNext) {
        throw new Error("Use Start Next to put a printer into printing state.")
      }
      if (existing.currentJobId && requestedStatus !== "PRINTING") {
        throw new Error("Mark the current print ready before changing printer status.")
      }
    }

    if (Object.keys(data).length > 0) {
      await tx.manufacturingPrinter.update({
        where: { id: printerId },
        data,
      })
    }

    if (input.assignNext) {
      const effectiveStatus = (data.status as ManufacturingPrinterStatus | undefined) ?? existing.status
      if (effectiveStatus !== "AVAILABLE") {
        throw new Error("Printer is not available.")
      }
      const next = await tx.manufacturingJob.findFirst({
        where: {
          status: "QUEUED",
          assignedPrinterId: null,
          estimatedMinutes: { not: null },
          OR: [
            { timeApprovedAt: { not: null } },
            { team: { manufacturingAutoApprovePrints: true } },
          ],
        },
        include: {
          team: {
            select: {
              manufacturingAllowanceMinutes: true,
              manufacturingAllowanceResetAt: true,
              manufacturingAutoApprovePrints: true,
            },
          },
        },
        orderBy: [{ priority: "desc" }, { submittedAt: "asc" }],
      })
      if (next) {
        const estimatedMinutes = next.estimatedMinutes
        if (!estimatedMinutes) {
          throw new Error("Estimated print time is required before starting.")
        }
        if (
          !next.team.manufacturingAutoApprovePrints &&
          !next.timeApprovedAt &&
          !next.overBudgetApprovedAt
        ) {
          throw new Error("Team time approval is required before starting this print.")
        }

        const usage = await teamUsage(tx, next.teamId, next.team.manufacturingAllowanceResetAt)
        const overBudget =
          usage.usedMinutes + usage.reservedMinutes > next.team.manufacturingAllowanceMinutes
        if (overBudget && !next.overBudgetApprovedAt) {
          throw new Error("Estimated print time exceeds remaining allowance. Approve the over-budget estimate first.")
        }

        const startedAt = new Date()
        const jobUpdate = await tx.manufacturingJob.updateMany({
          where: { id: next.id, assignedPrinterId: null, status: "QUEUED" },
          data: {
            assignedPrinterId: printerId,
            status: "PRINTING",
            startedAt: next.startedAt ?? startedAt,
            estimatedMinutes,
            timeApprovedAt: next.timeApprovedAt ?? startedAt,
          },
        })
        if (jobUpdate.count !== 1) {
          throw new Error("Print job was already assigned.")
        }

        const printerUpdate = await tx.manufacturingPrinter.updateMany({
          where: { id: printerId, currentJobId: null, status: "AVAILABLE" },
          data: {
            status: "PRINTING",
            currentJobId: next.id,
          },
        })
        if (printerUpdate.count !== 1) {
          throw new Error("Printer is not available.")
        }
      }
    }

    if (input.completeCurrent) {
      const printer = await tx.manufacturingPrinter.findUnique({
        where: { id: printerId },
        select: { currentJobId: true },
      })
      if (printer?.currentJobId) {
        await tx.manufacturingJob.update({
          where: { id: printer.currentJobId },
          data: {
            status: "READY",
            completedAt: new Date(),
            collectedAt: null,
          },
        })
      }
      const currentJobId = printer?.currentJobId ?? existing.currentJobId
      const printerUpdate = await tx.manufacturingPrinter.updateMany({
        where: { id: printerId, currentJobId: currentJobId ?? null },
        data: {
          status: "AVAILABLE",
          currentJobId: null,
          lastCompletedJobId: currentJobId,
        },
      })
      if (printerUpdate.count !== 1) {
        throw new Error("Printer state changed before completion.")
      }
    }

    return tx.manufacturingPrinter.findUniqueOrThrow({
      where: { id: printerId },
    })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function deleteManufacturingPrinter(printerId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.manufacturingPrinter.findUnique({
      where: { id: printerId },
      select: { id: true, name: true, currentJobId: true },
    })
    if (!existing) throw new Error("Printer not found.")
    if (existing.currentJobId) {
      throw new Error("Cannot delete a printer with a print currently running.")
    }

    const activeAssignment = await tx.manufacturingJob.findFirst({
      where: {
        assignedPrinterId: printerId,
        status: { in: ACTIVE_RESERVE_STATUSES },
      },
      select: { id: true, projectName: true, status: true },
    })
    if (activeAssignment) {
      throw new Error(
        `Cannot delete a printer assigned to active job "${activeAssignment.projectName}".`
      )
    }

    await tx.manufacturingPrinter.delete({ where: { id: printerId } })
    return existing
  })
}

export async function updateManufacturingTeam(
  teamId: string,
  input: Record<string, unknown>
) {
  const data: Prisma.TeamUpdateInput = {}

  if (input.allowanceMinutes !== undefined) {
    data.manufacturingAllowanceMinutes = readAllowanceMinutes(input.allowanceMinutes)
  }
  if (input.maxMembersOverride !== undefined) {
    data.maxMembersOverride = readMaxMembersOverride(input.maxMembersOverride)
  }
  if (input.manufacturingAutoApprovePrints !== undefined) {
    data.manufacturingAutoApprovePrints = Boolean(input.manufacturingAutoApprovePrints)
  }

  if (Object.keys(data).length === 0) {
    throw new Error("No manufacturing team update provided.")
  }

  return prisma.team.update({
    where: { id: teamId },
    data,
  })
}
