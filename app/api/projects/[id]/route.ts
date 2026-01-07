import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { ProjectTag } from "@/app/generated/prisma/enums"

const ALLOWED_UPDATE_FIELDS = ["title", "description", "tags", "isStarter", "starterProjectId"] as const

type AllowedUpdateField = typeof ALLOWED_UPDATE_FIELDS[number]

function pickAllowedFields(body: Record<string, unknown>): Partial<{
  title: string
  description: string | null
  tags: ProjectTag[]
  isStarter: boolean
  starterProjectId: string | null
}> {
  const result: Record<string, unknown> = {}
  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (field in body) {
      result[field] = body[field]
    }
  }
  return result
}

export async function GET(
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

  const project = await prisma.project.findUnique({
    where: { id },
    include: { workSessions: true },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id && !user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const totalHours = project.workSessions.reduce(
    (acc, s) => acc + s.durationMinutes / 60,
    0
  )

  return NextResponse.json({ ...project, totalHours })
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

  const existingProject = await prisma.project.findUnique({
    where: { id },
  })

  if (!existingProject) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (existingProject.userId !== session.user.id && !user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const allowedData = pickAllowedFields(body)

  if (Object.keys(allowedData).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const project = await prisma.project.update({
    where: { id },
    data: allowedData,
  })

  return NextResponse.json(project)
}

export async function DELETE(
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

  const existingProject = await prisma.project.findUnique({
    where: { id },
  })

  if (!existingProject) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (existingProject.userId !== session.user.id && !user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.project.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
