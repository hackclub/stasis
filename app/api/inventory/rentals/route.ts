import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { pushSSE } from "@/lib/inventory/sse"
import { notifyRental } from "@/lib/inventory/notifications"
import {
  MAX_CONCURRENT_RENTALS,
  TOOL_RENTAL_TIME_LIMIT_MINUTES,
} from "@/lib/inventory/config"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

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
      rentedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(rentals)
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { toolId, floor, location } = body as {
    toolId: string
    floor: number
    location: string
  }

  if (!toolId || typeof floor !== "number" || !location) {
    return NextResponse.json(
      { error: "toolId, floor, and location are required" },
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

      const tool = await tx.tool.findUnique({ where: { id: toolId } })
      if (!tool) {
        throw new Error("Tool not found")
      }
      if (!tool.available) {
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

      await tx.tool.update({
        where: { id: toolId },
        data: { available: false },
      })

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
          location,
          dueAt,
        },
        include: {
          tool: true,
          rentedBy: { select: { id: true, name: true, email: true } },
        },
      })
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to rent tool"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  notifyRental(rental.teamId, rental.tool.name, "Tool Rented")
  pushSSE(rental.teamId, { type: "rental_created", data: rental })

  return NextResponse.json(rental, { status: 201 })
}
