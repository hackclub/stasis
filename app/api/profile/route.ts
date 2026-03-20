import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { sanitize } from "@/lib/sanitize"

export async function PATCH(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { bio } = body

  if (typeof bio !== "string") {
    return NextResponse.json({ error: "bio must be a string" }, { status: 400 })
  }

  const sanitizedBio = sanitize(bio)

  if (sanitizedBio.length > 160) {
    return NextResponse.json(
      { error: "Bio must be 160 characters or less" },
      { status: 400 }
    )
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { bio: sanitizedBio },
    select: {
      id: true,
      slackDisplayName: true,
      name: true,
      image: true,
      bio: true,
    },
  })

  return NextResponse.json({
    ...user,
    name: user.slackDisplayName || user.name,
    slackDisplayName: undefined,
  })
}
