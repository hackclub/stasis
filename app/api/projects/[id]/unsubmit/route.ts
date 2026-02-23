import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { logAudit, AuditAction } from "@/lib/audit"
import { headers } from "next/headers"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const body = await request.json().catch(() => ({}))
  const stage = body.stage as "design" | "build"

  if (stage !== "design" && stage !== "build") {
    return NextResponse.json(
      { error: "stage must be 'design' or 'build'" },
      { status: 400 }
    )
  }

  const project = await prisma.project.findUnique({
    where: { id },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const currentStatus = stage === "design" ? project.designStatus : project.buildStatus

  if (currentStatus !== "in_review") {
    return NextResponse.json(
      { error: `${stage} is not currently in review` },
      { status: 400 }
    )
  }

  const updateData = stage === "design"
    ? { designStatus: "draft" as const, designSubmissionNotes: null }
    : { buildStatus: "draft" as const, buildSubmissionNotes: null }

  const updatedProject = await prisma.project.update({
    where: { id },
    data: updateData,
  })

  await logAudit({
    action: AuditAction.USER_UNSUBMIT_PROJECT,
    actorId: session.user.id,
    actorEmail: session.user.email,
    targetType: "Project",
    targetId: id,
    metadata: { stage, title: project.title },
  })

  return NextResponse.json(updatedProject)
}
