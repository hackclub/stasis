import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { pushSSE } from "@/lib/inventory/sse"
import { notifyRental } from "@/lib/inventory/notifications"
import { requireInventoryAccess } from "@/lib/inventory/access"
import { logAudit, AuditAction } from "@/lib/audit"
import {
  MAX_CONCURRENT_RENTALS,
  TOOL_RENTAL_TIME_LIMIT_MINUTES,
} from "@/lib/inventory/config"
import {
  sanitizeLocation,
  validateFloor,
} from "@/lib/inventory/validation"

export async function GET() {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error
  const { session } = result

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teamId: true },
  })

  if (!user?.teamId) {
    return NextResponse.json(
      { error: "You must be on a team to view rentals" },
      { status: 403 }
    )
  }

  const rentals = await prisma.toolRental.findMany({
    where: { teamId: user.teamId },
    include: {
      tool: true,
      rentedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(rentals)
}

export async function POST(request: Request) {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error
  const { session } = result

  const body = await request.json()
  const { toolId, floor, location } = body as {
    toolId: string
    floor: number
    location: string
  }

  if (!toolId || typeof toolId !== "string") {
    return NextResponse.json(
      { error: "toolId is required" },
      { status: 400 }
    )
  }

  if (!validateFloor(floor)) {
    return NextResponse.json(
      { error: "Invalid floor number" },
      { status: 400 }
    )
  }

  if (!location || typeof location !== "string") {
    return NextResponse.json(
      { error: "Location is required" },
      { status: 400 }
    )
  }

  const safeLocation = sanitizeLocation(location)
  if (safeLocation.length === 0) {
    return NextResponse.json(
      { error: "Location is required" },
      { status: 400 }
    )
  }

  let rental
  try {
    rental = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: session.user.id },
        include: { team: true },
      })

      if (!user?.teamId || !user.team) {
        throw new Error("You must be on a team to rent a tool")
      }

      if (user.team.locked) {
        throw new Error("Your team is locked and cannot rent tools")
      }

      // Conditionally mark tool as unavailable only if currently available (prevents double-rent race)
      const updated = await tx.tool.updateMany({
        where: { id: toolId, available: true },
        data: { available: false },
      })
      if (updated.count === 0) {
        const tool = await tx.tool.findUnique({ where: { id: toolId } })
        if (!tool) throw new Error("Tool not found")
        throw new Error("Tool is not available")
      }

      const activeRentals = await tx.toolRental.count({
        where: {
          teamId: user.teamId,
          status: "CHECKED_OUT",
        },
      })

      if (activeRentals >= MAX_CONCURRENT_RENTALS) {
        throw new Error(
          `Your team already has ${MAX_CONCURRENT_RENTALS} active rental(s)`
        )
      }

      const dueAt =
        TOOL_RENTAL_TIME_LIMIT_MINUTES > 0
          ? new Date(Date.now() + TOOL_RENTAL_TIME_LIMIT_MINUTES * 60 * 1000)
          : null

      return tx.toolRental.create({
        data: {
          toolId,
          teamId: user.teamId,
          rentedById: session.user.id,
          floor,
          location: safeLocation,
          dueAt,
        },
        include: {
          tool: true,
          rentedBy: { select: { id: true, name: true } },
        },
      })
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to rent tool"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  logAudit({
    action: AuditAction.INVENTORY_RENTAL_CREATE,
    actorId: session.user.id,
    actorEmail: session.user.email,
    targetType: "ToolRental",
    targetId: rental.id,
    metadata: { toolId, teamId: rental.teamId, floor, location: safeLocation },
  }).catch(() => {})

  notifyRental(rental.teamId, rental.tool.name, "Tool Rented")
  pushSSE(rental.teamId, { type: "rental_created", data: rental })

  return NextResponse.json(rental, { status: 201 })
}
