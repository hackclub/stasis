import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { ProjectTag } from "@/app/generated/prisma/enums"

const VALID_TAGS: ProjectTag[] = ["PCB", "ROBOT", "CAD", "ARDUINO", "RASPBERRY_PI"]

function validateTags(tags: unknown): ProjectTag[] {
  if (!Array.isArray(tags)) return []
  return tags.filter((tag): tag is ProjectTag => VALID_TAGS.includes(tag as ProjectTag))
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const requestedUserId = searchParams.get("userId")

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  })

  let whereClause: { userId: string }
  if (requestedUserId && user?.isAdmin) {
    whereClause = { userId: requestedUserId }
  } else {
    whereClause = { userId: session.user.id }
  }

  const projects = await prisma.project.findMany({
    where: whereClause,
    include: { workSessions: true, badges: true },
    orderBy: { createdAt: "desc" },
  })

  const projectsWithHours = projects.map((project) => ({
    ...project,
    totalHoursClaimed: project.workSessions.reduce(
      (acc, s) => acc + s.hoursClaimed,
      0
    ),
    totalHoursApproved: project.workSessions.reduce(
      (acc, s) => acc + (s.hoursApproved ?? 0),
      0
    ),
  }))

  return NextResponse.json(projectsWithHours)
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { title, description, tags, isStarter, starterProjectId } = body

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 })
  }

  if (title.length > 200) {
    return NextResponse.json({ error: "Title too long" }, { status: 400 })
  }

  if (description && typeof description === "string" && description.length > 2000) {
    return NextResponse.json({ error: "Description too long" }, { status: 400 })
  }

  const project = await prisma.project.create({
    data: {
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : null,
      tags: validateTags(tags),
      isStarter: Boolean(isStarter),
      starterProjectId: typeof starterProjectId === "string" ? starterProjectId : null,
      userId: session.user.id,
    },
  })

  return NextResponse.json(project)
}
