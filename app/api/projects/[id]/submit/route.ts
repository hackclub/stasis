import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { logAudit, AuditAction } from "@/lib/audit"
import { headers } from "next/headers"
import { sanitize } from "@/lib/sanitize"

const MIN_BUILD_HOURS_REQUIRED = 4

// TODO: Add rate limiting - prevent submission spam
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
  const submissionNotes = typeof body.submissionNotes === "string" ? sanitize(body.submissionNotes) : null

  if (stage !== "design" && stage !== "build") {
    return NextResponse.json(
      { error: "stage must be 'design' or 'build'" },
      { status: 400 }
    )
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      workSessions: true,
      badges: true,
      bomItems: true,
    },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (stage === "design") {
    // Design stage submission
    if (project.designStatus !== "draft" && project.designStatus !== "rejected") {
      return NextResponse.json(
        { error: "Design already submitted for review" },
        { status: 400 }
      )
    }

    // Design requirements: title, description, at least one BOM item
    if (!project.title.trim()) {
      return NextResponse.json(
        { error: "Project title is required" },
        { status: 400 }
      )
    }

    if (!project.description?.trim()) {
      return NextResponse.json(
        { error: "Project description is required for design review" },
        { status: 400 }
      )
    }

    if (project.bomItems.length === 0 && !project.noBomNeeded) {
      return NextResponse.json(
        { error: "At least one BOM item is required for design review" },
        { status: 400 }
      )
    }

    if (!project.githubRepo) {
      return NextResponse.json(
        { error: "GitHub repository is required for design review" },
        { status: 400 }
      )
    }

    if (project.badges.length === 0) {
      return NextResponse.json(
        { error: "At least one badge is required for design review" },
        { status: 400 }
      )
    }

    if (!project.coverImage) {
      return NextResponse.json(
        { error: "Project image is required for design review" },
        { status: 400 }
      )
    }

    const [updatedProject] = await prisma.$transaction([
      prisma.project.update({
        where: { id },
        data: {
          designStatus: "in_review",
          designSubmissionNotes: submissionNotes,
          designReviewComments: null,
          designReviewedAt: null,
          designReviewedBy: null,
        },
      }),
      prisma.projectSubmission.create({
        data: {
          projectId: id,
          stage: "DESIGN",
          notes: submissionNotes,
        },
      }),
    ])

    await logAudit({
      action: AuditAction.USER_SUBMIT_PROJECT,
      actorId: session.user.id,
      actorEmail: session.user.email,
      targetType: "Project",
      targetId: id,
      metadata: { stage: "design", title: project.title },
    })

    return NextResponse.json(updatedProject)
  } else {
    // Build stage submission
    if (project.designStatus !== "approved") {
      return NextResponse.json(
        { error: "Design must be approved before submitting build" },
        { status: 400 }
      )
    }

    if (project.buildStatus !== "draft" && project.buildStatus !== "rejected" && project.buildStatus !== "update_requested") {
      return NextResponse.json(
        { error: "Build already submitted for review" },
        { status: 400 }
      )
    }

    if (!project.githubRepo) {
      return NextResponse.json(
        { error: "GitHub repository link is required for build review" },
        { status: 400 }
      )
    }

    if (project.badges.length === 0) {
      return NextResponse.json(
        { error: "At least one badge must be claimed for build review" },
        { status: 400 }
      )
    }

    // Count only BUILD stage sessions
    const buildSessions = project.workSessions.filter(s => s.stage === "BUILD")
    const totalBuildHours = buildSessions.reduce((acc, s) => acc + s.hoursClaimed, 0)

    if (totalBuildHours < MIN_BUILD_HOURS_REQUIRED) {
      return NextResponse.json(
        { error: `Minimum ${MIN_BUILD_HOURS_REQUIRED} hours of build work required` },
        { status: 400 }
      )
    }

    const [updatedProject] = await prisma.$transaction([
      prisma.project.update({
        where: { id },
        data: {
          buildStatus: "in_review",
          buildSubmissionNotes: submissionNotes,
          buildReviewComments: null,
          buildReviewedAt: null,
          buildReviewedBy: null,
        },
      }),
      prisma.projectSubmission.create({
        data: {
          projectId: id,
          stage: "BUILD",
          notes: submissionNotes,
        },
      }),
    ])

    await logAudit({
      action: AuditAction.USER_SUBMIT_PROJECT,
      actorId: session.user.id,
      actorEmail: session.user.email,
      targetType: "Project",
      targetId: id,
      metadata: { stage: "build", title: project.title },
    })

    return NextResponse.json(updatedProject)
  }
}
