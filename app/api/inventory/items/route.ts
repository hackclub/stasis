import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const items = await prisma.item.findMany({
    orderBy: { name: "asc" },
  })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teamId: true },
  })

  if (user?.teamId) {
    const usageRows = await prisma.orderItem.groupBy({
      by: ["itemId"],
      where: {
        order: { teamId: user.teamId },
      },
      _sum: { quantity: true },
    })

    const usageMap = new Map(
      usageRows.map((r) => [r.itemId, r._sum.quantity ?? 0])
    )

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

  return NextResponse.json(
    items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl,
      stock: item.stock,
      category: item.category,
      maxPerTeam: item.maxPerTeam,
      teamUsed: 0,
    }))
  )
}
