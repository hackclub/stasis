import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

const VALID_PRONOUNS = ["he/him", "she/her", "they/them"]

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { pronouns: true },
  })

  return NextResponse.json({ pronouns: user?.pronouns ?? null })
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { pronouns } = body

  if (!VALID_PRONOUNS.includes(pronouns)) {
    return NextResponse.json({ error: "Invalid pronouns" }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { pronouns },
  })

  return NextResponse.json({ success: true })
}
