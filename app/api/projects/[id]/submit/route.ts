import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

const MIN_HOURS_REQUIRED = 4

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      workSessions: true,
      badges: true,
    },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (project.submittedAt) {
    return NextResponse.json(
      { error: "Project already submitted for review" },
      { status: 400 }
    )
  }

  if (!project.githubRepo) {
    return NextResponse.json(
      { error: "GitHub repository link is required" },
      { status: 400 }
    )
  }

  if (project.badges.length === 0) {
    return NextResponse.json(
      { error: "At least one badge must be claimed" },
      { status: 400 }
    )
  }

  const totalHoursClaimed = project.workSessions.reduce(
    (acc, s) => acc + s.hoursClaimed,
    0
  )

  if (totalHoursClaimed < MIN_HOURS_REQUIRED) {
    return NextResponse.json(
      { error: `Minimum ${MIN_HOURS_REQUIRED} hours of logged work required` },
      { status: 400 }
    )
  }

  const updatedProject = await prisma.project.update({
    where: { id },
    data: { submittedAt: new Date() },
  })

  return NextResponse.json(updatedProject)
}
