import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { sanitize } from "@/lib/sanitize"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireAdmin()
  if (adminCheck.error) return adminCheck.error

  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    include: { 
      workSessions: true,
      bomItems: true,
    },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const body = await request.json()
  const { stage, decision, reviewComments } = body

  if (stage !== "design" && stage !== "build") {
    return NextResponse.json(
      { error: "stage must be 'design' or 'build'" },
      { status: 400 }
    )
  }

  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json(
      { error: "decision must be 'approved' or 'rejected'" },
      { status: 400 }
    )
  }

  const adminUserId = adminCheck.session.user.id
  const now = new Date()
  const sanitizedComments = typeof reviewComments === "string" ? sanitize(reviewComments) : null

  if (stage === "design") {
    // Design stage review
    if (project.designStatus !== "in_review" && project.designStatus !== "update_requested") {
      return NextResponse.json(
        { error: "Design is not pending review" },
        { status: 400 }
      )
    }

    // If approving design, also approve pending BOM items
    if (decision === "approved") {
      await prisma.bOMItem.updateMany({
        where: { projectId: id, status: "pending" },
        data: {
          status: "approved",
          reviewedAt: now,
          reviewedBy: adminUserId,
        },
      })
    }

    const updatedProject = await prisma.project.update({
      where: { id },
      data: {
        designStatus: decision,
        designReviewComments: sanitizedComments,
        designReviewedAt: now,
        designReviewedBy: adminUserId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        workSessions: {
          include: { media: true },
          orderBy: { createdAt: "desc" },
        },
        badges: true,
        bomItems: true,
      },
    })

    return NextResponse.json(updatedProject)
  } else {
    // Build stage review
    if (project.designStatus !== "approved") {
      return NextResponse.json(
        { error: "Design must be approved before reviewing build" },
        { status: 400 }
      )
    }

    if (project.buildStatus !== "in_review" && project.buildStatus !== "update_requested") {
      return NextResponse.json(
        { error: "Build is not pending review" },
        { status: 400 }
      )
    }

    // Use a transaction for build approval to ensure atomicity
    if (decision === "approved") {
      const updatedProject = await prisma.$transaction(async (tx) => {
        // Auto-approve pending BUILD work sessions
        const buildSessionsToApprove = project.workSessions.filter(
          (s) => s.stage === "BUILD" && s.hoursApproved === null
        )

        for (const session of buildSessionsToApprove) {
          await tx.workSession.update({
            where: { id: session.id },
            data: {
              hoursApproved: session.hoursClaimed,
              reviewedAt: now,
              reviewedBy: adminUserId,
            },
          })
        }

        // Grant badges only on build approval
        await tx.projectBadge.updateMany({
          where: { projectId: id, grantedAt: null },
          data: {
            grantedAt: now,
            grantedBy: adminUserId,
          },
        })

        // Update project build status
        return tx.project.update({
          where: { id },
          data: {
            buildStatus: decision,
            buildReviewComments: sanitizedComments,
            buildReviewedAt: now,
            buildReviewedBy: adminUserId,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
            workSessions: {
              include: { media: true },
              orderBy: { createdAt: "desc" },
            },
            badges: true,
            bomItems: true,
          },
        })
      })

      return NextResponse.json(updatedProject)
    } else {
      // Rejection - no transaction needed
      const updatedProject = await prisma.project.update({
        where: { id },
        data: {
          buildStatus: decision,
          buildReviewComments: sanitizedComments,
          buildReviewedAt: now,
          buildReviewedBy: adminUserId,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          workSessions: {
            include: { media: true },
            orderBy: { createdAt: "desc" },
          },
          badges: true,
          bomItems: true,
        },
      })

      return NextResponse.json(updatedProject)
    }
  }
}
