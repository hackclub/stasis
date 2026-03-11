import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { fetchHackatimeProjectSeconds } from "@/lib/hackatime"

export async function GET(
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
    include: { hackatimeProjects: true },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { hackatimeUserId: true },
  })

  if (!user?.hackatimeUserId) {
    return NextResponse.json({ linkedProjects: [] })
  }

  const linkedProjects = await Promise.all(
    project.hackatimeProjects.map(async (hp) => {
      const totalSeconds = await fetchHackatimeProjectSeconds(user.hackatimeUserId!, hp.hackatimeProject)
      return {
        id: hp.id,
        hackatimeProject: hp.hackatimeProject,
        totalSeconds,
        hoursApproved: hp.hoursApproved,
        createdAt: hp.createdAt,
      }
    })
  )

  return NextResponse.json({ linkedProjects })
}

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
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (project.designStatus === "in_review" || project.buildStatus === "in_review") {
    return NextResponse.json({ error: "Cannot modify hackatime projects while project is in review" }, { status: 400 })
  }

  const body = await request.json()
  const hackatimeProject = typeof body.hackatimeProject === "string" ? body.hackatimeProject.trim() : ""

  if (!hackatimeProject) {
    return NextResponse.json({ error: "hackatimeProject is required" }, { status: 400 })
  }

  const existing = await prisma.hackatimeProject.findUnique({
    where: { projectId_hackatimeProject: { projectId: id, hackatimeProject } },
  })

  if (existing) {
    return NextResponse.json({ error: "Project already linked" }, { status: 409 })
  }

  const linked = await prisma.hackatimeProject.create({
    data: {
      hackatimeProject,
      projectId: id,
    },
  })

  return NextResponse.json(linked, { status: 201 })
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
  const { searchParams } = new URL(request.url)
  const hackatimeProjectId = searchParams.get("hackatimeProjectId")

  if (!hackatimeProjectId) {
    return NextResponse.json({ error: "hackatimeProjectId is required" }, { status: 400 })
  }

  const hp = await prisma.hackatimeProject.findUnique({
    where: { id: hackatimeProjectId },
    include: { project: true },
  })

  if (!hp) {
    return NextResponse.json({ error: "Hackatime project not found" }, { status: 404 })
  }

  if (hp.project.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (hp.project.designStatus === "in_review" || hp.project.buildStatus === "in_review") {
    return NextResponse.json({ error: "Cannot modify hackatime projects while project is in review" }, { status: 400 })
  }

  if (hp.projectId !== id) {
    return NextResponse.json({ error: "Hackatime project does not belong to this project" }, { status: 400 })
  }

  await prisma.hackatimeProject.delete({ where: { id: hackatimeProjectId } })

  return NextResponse.json({ success: true })
}
