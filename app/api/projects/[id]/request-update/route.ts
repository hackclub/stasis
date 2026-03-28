import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { sanitize } from "@/lib/sanitize"

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

  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Only approved builds can request updates
  if (project.buildStatus !== "approved") {
    return NextResponse.json(
      { error: "Only projects with approved builds can request updates" },
      { status: 400 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const submissionNotes = typeof body.submissionNotes === "string" ? sanitize(body.submissionNotes) : null

  const updatedProject = await prisma.project.update({
    where: { id },
    data: {
      buildStatus: "update_requested",
      buildSubmissionNotes: submissionNotes,
      buildReviewComments: null,
      buildReviewedAt: null,
      buildReviewedBy: null,
    },
  })

  return NextResponse.json(updatedProject)
}
