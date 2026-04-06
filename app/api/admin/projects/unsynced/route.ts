import { NextResponse } from "next/server"
import Airtable from "airtable"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"

export async function GET() {
  const authCheck = await requireAdmin()
  if (authCheck.error) return authCheck.error

  const apiKey = process.env.AIRTABLE_API_KEY
  const baseId = process.env.AIRTABLE_BASE_ID
  if (!apiKey || !baseId) {
    return NextResponse.json({ error: "Airtable not configured" }, { status: 500 })
  }

  const base = new Airtable({ apiKey }).base(baseId)
  const tableName = process.env.AIRTABLE_YSWS_TABLE_NAME || "YSWS Project Submission"

  // Fetch all Stasis IDs from Airtable
  const syncedIds = new Set<string>()
  await base(tableName)
    .select({ fields: ["Stasis ID", "Stage"] })
    .eachPage((records, fetchNextPage) => {
      for (const r of records) {
        const stasisId = r.get("Stasis ID") as string | undefined
        const stage = r.get("Stage") as string | undefined
        if (stasisId) syncedIds.add(`${stasisId}:${stage || ""}`)
      }
      fetchNextPage()
    })

  // Find approved projects not in Airtable
  const approvedProjects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      OR: [
        { designStatus: "approved" },
        { buildStatus: "approved" },
      ],
    },
    select: {
      id: true,
      title: true,
      tier: true,
      designStatus: true,
      buildStatus: true,
      designReviewedAt: true,
      buildReviewedAt: true,
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const unsynced: Array<{
    id: string
    title: string
    tier: number | null
    stage: string
    reviewedAt: Date | null
    userName: string | null
    userEmail: string
  }> = []

  for (const p of approvedProjects) {
    if (p.designStatus === "approved" && !syncedIds.has(`${p.id}:Design`)) {
      unsynced.push({
        id: p.id,
        title: p.title,
        tier: p.tier,
        stage: "Design",
        reviewedAt: p.designReviewedAt,
        userName: p.user.name,
        userEmail: p.user.email,
      })
    }
    if (p.buildStatus === "approved" && !syncedIds.has(`${p.id}:Build`)) {
      unsynced.push({
        id: p.id,
        title: p.title,
        tier: p.tier,
        stage: "Build",
        reviewedAt: p.buildReviewedAt,
        userName: p.user.name,
        userEmail: p.user.email,
      })
    }
  }

  return NextResponse.json({ unsynced, syncedCount: syncedIds.size })
}
