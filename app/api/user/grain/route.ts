import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { disableGrain: true },
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  return NextResponse.json({ disableGrain: user.disableGrain })
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { disableGrain } = body

  if (typeof disableGrain !== "boolean") {
    return NextResponse.json({ error: "Invalid value" }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { disableGrain },
  })

  return NextResponse.json({ success: true, disableGrain })
}
