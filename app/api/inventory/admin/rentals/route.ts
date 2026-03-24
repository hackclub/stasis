import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"

export async function GET() {
  const adminResult = await requireAdmin()
  if ("error" in adminResult) return adminResult.error

  const rentals = await prisma.toolRental.findMany({
    where: { status: "CHECKED_OUT" },
    include: {
      tool: true,
      team: { select: { id: true, name: true } },
      rentedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(rentals)
}
