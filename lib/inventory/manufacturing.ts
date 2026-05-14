import prisma from "@/lib/prisma"
import { sanitize } from "@/lib/sanitize"
import {
  ManufacturingJobStatus,
  ManufacturingPrinterStatus,
  Prisma,
} from "@/app/generated/prisma/client"

const DEFAULT_ALLOWANCE_MINUTES = 240
const DEFAULT_WARNING_LONG_PRINT_MINUTES = 240
const MAX_SHORT_TEXT = 160
const MAX_LONG_TEXT = 2000

export const ACTIVE_RESERVE_STATUSES: ManufacturingJobStatus[] = [
  "PENDING",
  "APPROVED",
  "QUEUED",
  "PRINTING",
  "PAUSED",
]

export const OPEN_JOB_STATUSES: ManufacturingJobStatus[] = [
  "PENDING",
  "APPROVED",
  "QUEUED",
]

export const ACTIVE_JOB_STATUSES: ManufacturingJobStatus[] = [
  "PRINTING",
  "PAUSED",
]

const JOB_STATUS_VALUES = new Set<string>(Object.values(ManufacturingJobStatus))
const PRINTER_STATUS_VALUES = new Set<string>(Object.values(ManufacturingPrinterStatus))

type Tx = Prisma.TransactionClient

type JobWithRelations = Prisma.ManufacturingJobGetPayload<{
  include: {
    team: { select: { id: true; name: true; manufacturingAllowanceMinutes: true } }
    submittedBy: {
      select: {
        id: true
        name: true
        email: true
        slackId: true
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

function readPositiveMinutes(value: unknown, fallback = 60): number {
  const parsed = Math.round(Number(value))
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, 7 * 24 * 60)
}

function readNonNegativeInt(value: unknown, fallback = 0, max = 100): number {
  const parsed = Math.round(Number(value))
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.min(parsed, max)
}

function readJobStatus(value: unknown, fallback: ManufacturingJobStatus): ManufacturingJobStatus {
  if (typeof value !== "string") return fallback
  const status = value.toUpperCase()
  return JOB_STATUS_VALUES.has(status) ? (status as ManufacturingJobStatus) : fallback
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
  return user.slackId ?? ""
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
      email: job.submittedBy.email,
      slackId: job.submittedBy.slackId,
      slackDisplayName: job.submittedBy.slackDisplayName,
      image: job.submittedBy.image,
    },
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
    staffNotes: job.staffNotes ?? "",
    priority: job.priority,
  }
}

async function teamUsage(tx: Tx, teamId: string) {
  const [reserved, used] = await Promise.all([
    tx.manufacturingJob.aggregate({
      where: { teamId, status: { in: ACTIVE_RESERVE_STATUSES } },
      _sum: { estimatedMinutes: true },
    }),
    tx.manufacturingJob.aggregate({
      where: { teamId, status: "COMPLETED" },
      _sum: { estimatedMinutes: true },
    }),
  ])

  return {
    reservedMinutes: reserved._sum.estimatedMinutes ?? 0,
    usedMinutes: used._sum.estimatedMinutes ?? 0,
  }
}

export async function readManufacturingState(currentUserId?: string) {
  const [settingsRecord, printers, jobs, teams, currentUser] = await Promise.all([
    prisma.manufacturingSettings.findUnique({ where: { id: "singleton" } }),
    prisma.manufacturingPrinter.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.manufacturingJob.findMany({
      include: {
        team: { select: { id: true, name: true, manufacturingAllowanceMinutes: true } },
        submittedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            slackId: true,
            slackDisplayName: true,
            image: true,
          },
        },
        assignedPrinter: { select: { id: true, name: true, status: true } },
      },
      orderBy: [{ priority: "desc" }, { submittedAt: "asc" }],
    }),
    prisma.team.findMany({
      select: {
        id: true,
        name: true,
        locked: true,
        manufacturingAllowanceMinutes: true,
        _count: { select: { members: true } },
      },
      orderBy: { name: "asc" },
    }),
    currentUserId
      ? prisma.user.findUnique({
          where: { id: currentUserId },
          select: {
            id: true,
            name: true,
            email: true,
            slackId: true,
            slackDisplayName: true,
            image: true,
            teamId: true,
            team: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve(null),
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

  for (const job of jobs) {
    const stats = teamStats.get(job.teamId)
    if (!stats) continue
    stats.jobsSubmitted += 1
    if (ACTIVE_RESERVE_STATUSES.includes(job.status)) {
      stats.reservedMinutes += job.estimatedMinutes
    }
    if (job.status === "COMPLETED") {
      stats.usedMinutes += job.estimatedMinutes
      stats.jobsCompleted += 1
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
    }
  })

  const queuedJobs = jobs.filter((job) => OPEN_JOB_STATUSES.includes(job.status))
  const queuedMinutes = queuedJobs.reduce((sum, job) => sum + job.estimatedMinutes, 0)
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
  const pressureRatio = activePrinters === 0 ? 1 : queuedMinutes / (activePrinters * 240)
  const longestWaitingJob = [...queuedJobs].sort(
    (a, b) => a.submittedAt.getTime() - b.submittedAt.getTime()
  )[0] ?? null
  const longestPrintJob = [...jobs].sort(
    (a, b) => b.estimatedMinutes - a.estimatedMinutes
  )[0] ?? null

  return {
    printers: printers.map((printer) => ({
      id: printer.id,
      name: printer.name,
      status: printer.status,
      currentJobId: printer.currentJobId,
      progress: printer.progress,
      timeRemainingMinutes: printer.timeRemainingMinutes,
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
      totalCapacityMinutes: printers.length * 72 * 60,
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
          slackId: currentUser.slackId,
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
      },
    })
    if (!team) throw new Error("Team not found.")
    if (team.locked && !staffOverride) {
      throw new Error("Your team is locked and cannot submit print jobs.")
    }

    const projectName = cleanText(input.projectName)
    const description = cleanText(input.description, MAX_LONG_TEXT)
    const estimatedMinutes = readPositiveMinutes(input.estimatedMinutes)
    if (!projectName) throw new Error("Project name is required.")
    if (!description) throw new Error("Short description is required.")

    if (!staffOverride) {
      const usage = await teamUsage(tx, team.id)
      const remaining =
        team.manufacturingAllowanceMinutes -
        usage.usedMinutes -
        usage.reservedMinutes
      if (estimatedMinutes > remaining) {
        throw new Error(
          "Estimated print time exceeds remaining allowance. Ask an organiser for an override."
        )
      }
    }

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
    if (status === "QUEUED" && !assignedPrinterId) status = "APPROVED"
    if (status === "PRINTING" && !assignedPrinterId) status = "APPROVED"

    return tx.manufacturingJob.create({
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
        priority: staffOverride ? Boolean(input.priority) : false,
        status,
        assignedPrinterId,
      },
    })
  })
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
        assignedPrinterId: true,
        estimatedMinutes: true,
        startedAt: true,
        completedAt: true,
      },
    })
    if (!existing) throw new Error("Job not found.")

    const data: Prisma.ManufacturingJobUncheckedUpdateInput = {}
    let assignedPrinterId = existing.assignedPrinterId

    if (input.projectName !== undefined) {
      const projectName = cleanText(input.projectName)
      if (!projectName) throw new Error("Project name is required.")
      data.projectName = projectName
    }
    if (input.description !== undefined) data.description = cleanText(input.description, MAX_LONG_TEXT)
    if (input.estimatedMinutes !== undefined) {
      data.estimatedMinutes = readPositiveMinutes(input.estimatedMinutes, existing.estimatedMinutes)
    }
    if (input.material !== undefined) data.material = cleanText(input.material) || "PLA"
    if (input.colour !== undefined) data.colour = cleanText(input.colour) || "Any"
    if (input.fileLink !== undefined) data.fileLink = cleanNullableText(input.fileLink)
    if (input.notes !== undefined) data.notes = cleanNullableText(input.notes)
    if (input.staffNotes !== undefined) data.staffNotes = cleanNullableText(input.staffNotes)
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
    }
    if (input.markUncollected) {
      data.collectedAt = null
    }

    if (input.status !== undefined) {
      let nextStatus = readJobStatus(input.status, "PENDING")
      if (nextStatus === "QUEUED" && !assignedPrinterId) nextStatus = "APPROVED"
      if (nextStatus === "PRINTING" && !assignedPrinterId) {
        throw new Error("Assign a printer before starting a print.")
      }

      data.status = nextStatus

      if (nextStatus === "PRINTING" && assignedPrinterId) {
        data.startedAt = existing.startedAt ?? new Date()
        await tx.manufacturingPrinter.updateMany({
          where: { currentJobId: jobId, id: { not: assignedPrinterId } },
          data: {
            currentJobId: null,
            status: "AVAILABLE",
            progress: 0,
            timeRemainingMinutes: 0,
          },
        })
        const printer = await tx.manufacturingPrinter.findUnique({
          where: { id: assignedPrinterId },
          select: { progress: true, timeRemainingMinutes: true },
        })
        await tx.manufacturingPrinter.update({
          where: { id: assignedPrinterId },
          data: {
            status: "PRINTING",
            currentJobId: jobId,
            progress: Math.max(printer?.progress ?? 0, 1),
            timeRemainingMinutes:
              printer?.timeRemainingMinutes ||
              Number(data.estimatedMinutes ?? existing.estimatedMinutes),
          },
        })
      }

      if (nextStatus === "PAUSED") {
        await tx.manufacturingPrinter.updateMany({
          where: {
            OR: [
              { currentJobId: jobId },
              ...(assignedPrinterId ? [{ id: assignedPrinterId }] : []),
            ],
          },
          data: { status: "PAUSED", currentJobId: jobId },
        })
      }

      if (nextStatus === "COMPLETED") {
        data.completedAt = existing.completedAt ?? new Date()
        data.collectedAt = null
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
            progress: 0,
            timeRemainingMinutes: 0,
            lastCompletedJobId: jobId,
          },
        })
      }

      if (nextStatus === "CANCELLED" || nextStatus === "REJECTED") {
        data.collectedAt = null
        data.assignedPrinterId = null
        assignedPrinterId = null
        await tx.manufacturingPrinter.updateMany({
          where: { currentJobId: jobId },
          data: {
            status: "AVAILABLE",
            currentJobId: null,
            progress: 0,
            timeRemainingMinutes: 0,
          },
        })
      }
    }

    return tx.manufacturingJob.update({
      where: { id: jobId },
      data,
    })
  })
}

export async function deleteManufacturingJob(jobId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.manufacturingPrinter.updateMany({
      where: { currentJobId: jobId },
      data: {
        currentJobId: null,
        status: "AVAILABLE",
        progress: 0,
        timeRemainingMinutes: 0,
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
        progress: true,
        timeRemainingMinutes: true,
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
    if (input.progress !== undefined) {
      data.progress = readNonNegativeInt(input.progress, existing.progress, 100)
    }
    if (input.timeRemainingMinutes !== undefined) {
      data.timeRemainingMinutes = readNonNegativeInt(
        input.timeRemainingMinutes,
        existing.timeRemainingMinutes,
        7 * 24 * 60
      )
    }
    if (input.notes !== undefined) {
      data.notes = cleanText(input.notes, MAX_LONG_TEXT)
    }
    if (input.sortOrder !== undefined) {
      data.sortOrder = readNonNegativeInt(input.sortOrder, 0, 1000)
    }

    if (Object.keys(data).length > 0) {
      await tx.manufacturingPrinter.update({
        where: { id: printerId },
        data,
      })
    }

    if (input.assignNext) {
      const next = await tx.manufacturingJob.findFirst({
        where: {
          status: { in: ["APPROVED", "QUEUED"] },
          OR: [{ assignedPrinterId: null }, { assignedPrinterId: printerId }],
        },
        orderBy: [{ priority: "desc" }, { submittedAt: "asc" }],
      })
      if (next) {
        await tx.manufacturingJob.update({
          where: { id: next.id },
          data: {
            assignedPrinterId: printerId,
            status: "PRINTING",
            startedAt: next.startedAt ?? new Date(),
          },
        })
        await tx.manufacturingPrinter.update({
          where: { id: printerId },
          data: {
            status: "PRINTING",
            currentJobId: next.id,
            progress: 1,
            timeRemainingMinutes: next.estimatedMinutes,
          },
        })
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
            status: "COMPLETED",
            completedAt: new Date(),
            collectedAt: null,
          },
        })
      }
      await tx.manufacturingPrinter.update({
        where: { id: printerId },
        data: {
          status: "AVAILABLE",
          currentJobId: null,
          progress: 0,
          timeRemainingMinutes: 0,
          lastCompletedJobId: printer?.currentJobId ?? existing.currentJobId,
        },
      })
    }

    return tx.manufacturingPrinter.findUniqueOrThrow({
      where: { id: printerId },
    })
  })
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
  const allowanceMinutes = readNonNegativeInt(
    input.allowanceMinutes,
    DEFAULT_ALLOWANCE_MINUTES,
    30 * 24 * 60
  )

  return prisma.team.update({
    where: { id: teamId },
    data: { manufacturingAllowanceMinutes: allowanceMinutes },
  })
}
