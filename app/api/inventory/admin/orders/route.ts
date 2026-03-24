import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { OrderStatus } from "@/app/generated/prisma/client"

export async function GET(request: Request) {
  const adminResult = await requireAdmin()
  if ("error" in adminResult) return adminResult.error

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") as OrderStatus | null

  const where = status ? { status } : {}

  const orders = await prisma.order.findMany({
    where,
    include: {
      team: { select: { id: true, name: true } },
      placedBy: { select: { id: true, name: true, email: true } },
      items: { include: { item: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(orders)
}
