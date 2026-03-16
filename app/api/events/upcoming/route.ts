import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const events = await prisma.event.findMany({
    where: { dateTime: { gt: new Date() } },
    orderBy: { dateTime: "asc" },
    take: 10,
  })

  return NextResponse.json({ events })
}
