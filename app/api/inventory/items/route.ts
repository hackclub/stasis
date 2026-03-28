import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireInventoryAccess } from "@/lib/inventory/access"

export async function GET() {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error
  const { session } = result

  const [items, user] = await Promise.all([
    prisma.item.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { teamId: true },
    }),
  ])

  let usageMap = new Map<string, number>()
  if (user?.teamId) {
    const usageRows = await prisma.orderItem.groupBy({
      by: ["itemId"],
      where: {
        order: { teamId: user.teamId, status: { not: "CANCELLED" } },
      },
      _sum: { quantity: true },
    })
    usageMap = new Map(usageRows.map((r) => [r.itemId, r._sum.quantity ?? 0]))
  }

  return NextResponse.json(
    items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl,
      stock: item.stock,
      category: item.category,
      maxPerTeam: item.maxPerTeam,
      teamUsed: usageMap.get(item.id) ?? 0,
    }))
  )
}
