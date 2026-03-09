import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

const CLAIM_DURATION_MS = 20 * 60 * 1000 // 20 minutes

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const { id } = await params
  const reviewerId = authCheck.session.user.id

  const submission = await prisma.projectSubmission.findUnique({
    where: { id },
    include: { claim: true },
  })

  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 })
  }

  // Check if already claimed by someone else and not expired
  if (submission.claim) {
    const isExpired = new Date(submission.claim.expiresAt) <= new Date()
    if (!isExpired && submission.claim.reviewerId !== reviewerId) {
      return NextResponse.json(
        { error: "Submission is claimed by another reviewer" },
        { status: 409 }
      )
    }
    // If expired or claimed by self, delete old claim
    await prisma.reviewClaim.delete({ where: { id: submission.claim.id } })
  }

  const claim = await prisma.reviewClaim.create({
    data: {
      submissionId: id,
      reviewerId,
      expiresAt: new Date(Date.now() + CLAIM_DURATION_MS),
    },
  })

  return NextResponse.json(claim)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const { id } = await params
  const reviewerId = authCheck.session.user.id

  const claim = await prisma.reviewClaim.findUnique({
    where: { submissionId: id },
  })

  if (!claim) {
    return NextResponse.json({ ok: true })
  }

  // Only the claimer (or expired claims) can be released
  if (claim.reviewerId !== reviewerId && new Date(claim.expiresAt) > new Date()) {
    return NextResponse.json(
      { error: "Cannot release another reviewer's active claim" },
      { status: 403 }
    )
  }

  await prisma.reviewClaim.delete({ where: { id: claim.id } })

  return NextResponse.json({ ok: true })
}
