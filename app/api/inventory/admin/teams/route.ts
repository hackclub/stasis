import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"

export async function GET() {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  const teams = await prisma.team.findMany({
    include: {
      members: { select: { id: true, name: true, slackDisplayName: true } },
    },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(teams)
}
