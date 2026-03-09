import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { sanitize } from "@/lib/sanitize"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const { id } = await params // submission ID
  const body = await request.json()
  const { content } = body

  if (typeof content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 })
  }

  // Get the submission to find the author
  const submission = await prisma.projectSubmission.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  })

  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 })
  }

  const aboutUserId = submission.project.userId
  const sanitizedContent = sanitize(content.trim())

  const note = await prisma.reviewerNote.upsert({
    where: { aboutUserId },
    update: { content: sanitizedContent },
    create: { aboutUserId, content: sanitizedContent },
  })

  return NextResponse.json(note)
}
