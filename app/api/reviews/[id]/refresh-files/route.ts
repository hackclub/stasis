import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { cacheCadFiles } from "@/lib/cad-discovery"

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const { id } = await params

  // Try as project ID first, then submission ID
  let project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, githubRepo: true },
  })

  if (!project) {
    const submission = await prisma.projectSubmission.findUnique({
      where: { id },
      select: { projectId: true },
    })
    if (submission) {
      project = await prisma.project.findUnique({
        where: { id: submission.projectId },
        select: { id: true, githubRepo: true },
      })
    }
  }

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (!project.githubRepo) {
    return NextResponse.json(
      { error: "Project has no GitHub repo" },
      { status: 400 }
    )
  }

  const latestSubmission = await prisma.projectSubmission.findFirst({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })

  if (!latestSubmission) {
    return NextResponse.json(
      { error: "No submission found" },
      { status: 404 }
    )
  }

  await cacheCadFiles(latestSubmission.id, project.githubRepo)

  const updated = await prisma.projectSubmission.findUnique({
    where: { id: latestSubmission.id },
    select: { cadFiles: true, cadFilesAt: true },
  })

  return NextResponse.json({
    cadFiles: updated?.cadFiles,
    cadFilesAt: updated?.cadFilesAt,
  })
}
