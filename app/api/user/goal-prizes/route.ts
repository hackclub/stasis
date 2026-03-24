import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const goalPrizeRows = await prisma.userGoalPrize.findMany({
    where: { userId: session.user.id },
  })

  if (goalPrizeRows.length === 0) {
    return NextResponse.json({ goalPrizes: [] })
  }

  const shopItems = await prisma.shopItem.findMany({
    where: { id: { in: goalPrizeRows.map(gp => gp.shopItemId) } },
    select: { id: true, name: true, price: true, imageUrl: true, description: true },
  })
  const itemMap = new Map(shopItems.map(si => [si.id, si]))

  const goalPrizes = goalPrizeRows
    .map(gp => {
      const item = itemMap.get(gp.shopItemId)
      if (!item) return null
      return {
        id: gp.id,
        shopItemId: gp.shopItemId,
        name: item.name,
        price: item.price,
        imageUrl: item.imageUrl,
        description: item.description,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  return NextResponse.json({ goalPrizes })
}

export async function PUT(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { shopItemIds } = await request.json()

  if (!Array.isArray(shopItemIds) || shopItemIds.length === 0) {
    return NextResponse.json({ error: "At least one prize must be selected" }, { status: 400 })
  }

  // Validate all prize IDs exist and are active
  const validItems = await prisma.shopItem.findMany({
    where: { id: { in: shopItemIds }, active: true },
    select: { id: true },
  })
  const validIds = new Set(validItems.map(i => i.id))
  const invalidIds = shopItemIds.filter((id: string) => !validIds.has(id))
  if (invalidIds.length > 0) {
    return NextResponse.json({ error: "Some prize IDs are invalid" }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.userGoalPrize.deleteMany({
      where: { userId: session.user.id },
    })
    await tx.userGoalPrize.createMany({
      data: shopItemIds.map((shopItemId: string) => ({
        userId: session.user.id,
        shopItemId,
      })),
    })
  })

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { shopItemId } = await request.json()

  if (!shopItemId) {
    return NextResponse.json({ error: "shopItemId is required" }, { status: 400 })
  }

  await prisma.userGoalPrize.deleteMany({
    where: { userId: session.user.id, shopItemId },
  })

  // Check if any goal prizes remain; if not, switch goal back to stasis
  const remaining = await prisma.userGoalPrize.count({
    where: { userId: session.user.id },
  })
  if (remaining === 0) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { eventPreference: 'stasis' },
    })
  }

  return NextResponse.json({ success: true })
}
