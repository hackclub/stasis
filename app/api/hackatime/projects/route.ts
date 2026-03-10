import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, providerId: "hackatime" },
    select: { accessToken: true },
  })

  if (!account?.accessToken) {
    return NextResponse.json({ error: "Hackatime account not linked" }, { status: 404 })
  }

  const res = await fetch(
    "https://hackatime.hackclub.com/api/v1/authenticated/projects",
    { headers: { Authorization: `Bearer ${account.accessToken}` }, signal: AbortSignal.timeout(10_000) }
  )

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch hackatime projects" }, { status: 502 })
  }

  const data = await res.json()

  return NextResponse.json({ projects: data.projects ?? [] })
}
