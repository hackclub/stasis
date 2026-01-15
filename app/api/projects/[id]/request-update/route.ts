import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
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

  const project = await prisma.project.findUnique({
    where: { id },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (project.status !== "approved") {
    return NextResponse.json(
      { error: "Only approved projects can request updates" },
      { status: 400 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const submissionNotes = typeof body.submissionNotes === "string" ? body.submissionNotes : null

  const updatedProject = await prisma.project.update({
    where: { id },
    data: {
      status: "update_requested",
      submissionNotes,
      reviewComments: null,
      reviewedAt: null,
      reviewedBy: null,
    },
  })

  return NextResponse.json(updatedProject)
}
