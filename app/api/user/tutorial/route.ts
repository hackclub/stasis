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
    select: {
      tutorialDashboard: true,
      tutorialProject: true,
    },
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  return NextResponse.json(user)
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { type } = body

  if (type !== "dashboard" && type !== "project") {
    return NextResponse.json({ error: "Invalid tutorial type" }, { status: 400 })
  }

  const updateData = type === "dashboard" 
    ? { tutorialDashboard: true } 
    : { tutorialProject: true }

  await prisma.user.update({
    where: { id: session.user.id },
    data: updateData,
  })

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type")

  let updateData: { tutorialDashboard?: boolean; tutorialProject?: boolean }
  if (type === "dashboard") {
    updateData = { tutorialDashboard: false }
  } else if (type === "project") {
    updateData = { tutorialProject: false }
  } else {
    updateData = { tutorialDashboard: false, tutorialProject: false }
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: updateData,
  })

  return NextResponse.json({ success: true })
}
