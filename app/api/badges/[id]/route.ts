import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const badge = await prisma.projectBadge.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  })

  if (!badge) {
    return NextResponse.json({ error: "Badge not found" }, { status: 404 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  })

  if (badge.project.userId !== session.user.id && !user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (badge.grantedAt && !user?.isAdmin) {
    return NextResponse.json({ error: "Cannot unclaim a granted badge" }, { status: 400 })
  }

  await prisma.projectBadge.delete({ where: { id } })

  return NextResponse.json({ success: true })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  })

  if (!user?.isAdmin) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 })
  }

  const badge = await prisma.projectBadge.findUnique({
    where: { id },
  })

  if (!badge) {
    return NextResponse.json({ error: "Badge not found" }, { status: 404 })
  }

  const body = await request.json()
  const { grant } = body

  if (grant === true) {
    const updated = await prisma.projectBadge.update({
      where: { id },
      data: {
        grantedAt: new Date(),
        grantedBy: session.user.id,
      },
    })
    return NextResponse.json(updated)
  } else if (grant === false) {
    const updated = await prisma.projectBadge.update({
      where: { id },
      data: {
        grantedAt: null,
        grantedBy: null,
      },
    })
    return NextResponse.json(updated)
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
