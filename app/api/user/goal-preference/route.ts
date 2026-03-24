import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { updateTargetGoal } from "@/lib/airtable"

const VALID_GOALS = ["stasis", "opensauce", "prizes"]

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      eventPreference: true,
      goalPrizes: {
        include: {
          // No ShopItem relation in schema, so we fetch separately
        },
      },
    },
  })

  // Fetch shop item details for goal prizes
  const goalPrizeRows = await prisma.userGoalPrize.findMany({
    where: { userId: session.user.id },
  })

  let goalPrizes: Array<{ id: string; shopItemId: string; name: string; price: number; imageUrl: string | null; description: string }> = []
  if (goalPrizeRows.length > 0) {
    const shopItems = await prisma.shopItem.findMany({
      where: { id: { in: goalPrizeRows.map(gp => gp.shopItemId) } },
      select: { id: true, name: true, price: true, imageUrl: true, description: true },
    })
    const itemMap = new Map(shopItems.map(si => [si.id, si]))
    goalPrizes = goalPrizeRows
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
  }

  return NextResponse.json({
    goal: user?.eventPreference ?? "stasis",
    goalPrizes,
  })
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { goal, goalPrizeIds } = body

  if (!VALID_GOALS.includes(goal)) {
    return NextResponse.json({ error: "Invalid goal" }, { status: 400 })
  }

  if (goal === 'prizes') {
    if (!Array.isArray(goalPrizeIds) || goalPrizeIds.length === 0) {
      return NextResponse.json({ error: "At least one prize must be selected" }, { status: 400 })
    }

    // Validate all prize IDs exist and are active
    const validItems = await prisma.shopItem.findMany({
      where: { id: { in: goalPrizeIds }, active: true },
      select: { id: true },
    })
    const validIds = new Set(validItems.map(i => i.id))
    const invalidIds = goalPrizeIds.filter((id: string) => !validIds.has(id))
    if (invalidIds.length > 0) {
      return NextResponse.json({ error: "Some prize IDs are invalid" }, { status: 400 })
    }

    // Update preference and goal prizes in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: session.user.id },
        data: { eventPreference: goal },
      })
      await tx.userGoalPrize.deleteMany({
        where: { userId: session.user.id },
      })
      await tx.userGoalPrize.createMany({
        data: goalPrizeIds.map((shopItemId: string) => ({
          userId: session.user.id,
          shopItemId,
        })),
      })
    })
  } else {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { eventPreference: goal },
    })
  }

  // Update Airtable target goal in the background
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true },
  })
  if (user) {
    updateTargetGoal(user.email, goal).catch((err) =>
      console.error("Failed to update Airtable target goal:", err)
    )
  }

  return NextResponse.json({ success: true })
}
