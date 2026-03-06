import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

/**
 * GET /api/shop/items
 *
 * Returns all active shop items, ordered by sortOrder then createdAt.
 */
export async function GET() {
  const items = await prisma.shopItem.findMany({
    where: { active: true },
    orderBy: [
      { sortOrder: "asc" },
      { price: "asc" },
    ],
    select: {
      id: true,
      name: true,
      description: true,
      longDescription: true,
      imageUrl: true,
      price: true,
      maxPerUser: true,
    },
  })

  return NextResponse.json({ items })
}
