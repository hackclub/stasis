import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { getUserRoles, hasRole, Role } from "@/lib/permissions"

export type TimelineItem =
  | {
      type: "PROJECT_CREATED"
      at: string
      projectId: string
    }
  | {
      type: "WORK_SESSION"
      at: string
      session: {
        id: string
        hoursClaimed: number
        hoursApproved: number | null
        content: string | null
        stage: "DESIGN" | "BUILD"
        media: { id: string; type: "IMAGE" | "VIDEO"; url: string }[]
      }
    }
  | {
      type: "SUBMISSION"
      at: string
      stage: "DESIGN" | "BUILD"
      notes: string | null
    }
  | {
      type: "REVIEW_ACTION"
      at: string
      stage: "DESIGN" | "BUILD"
      decision: "APPROVED" | "CHANGE_REQUESTED" | "REJECTED"
      comments: string | null
      grantAmount: number | null
      reviewerName: string | null
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

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      createdAt: true,
      userId: true,
    },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const roles = await getUserRoles(session.user.id)
  const isAdmin = hasRole(roles, Role.ADMIN)

  if (project.userId !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const [workSessions, submissions, reviewActions] = await Promise.all([
    prisma.workSession.findMany({
      where: { projectId: id },
      include: { media: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.projectSubmission.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.projectReviewAction.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "asc" },
    }),
  ])

  const reviewerIds = reviewActions
    .map((r) => r.reviewerId)
    .filter((id): id is string => id !== null)
  
  const reviewers = reviewerIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: reviewerIds } },
        select: { id: true, name: true },
      })
    : []
  
  const reviewerMap = new Map(reviewers.map((r) => [r.id, r.name]))

  const items: TimelineItem[] = []

  items.push({
    type: "PROJECT_CREATED",
    at: project.createdAt.toISOString(),
    projectId: project.id,
  })

  for (const ws of workSessions) {
    items.push({
      type: "WORK_SESSION",
      at: ws.createdAt.toISOString(),
      session: {
        id: ws.id,
        hoursClaimed: ws.hoursClaimed,
        hoursApproved: ws.hoursApproved,
        content: ws.content,
        stage: ws.stage,
        media: ws.media.map((m) => ({
          id: m.id,
          type: m.type,
          url: m.url,
        })),
      },
    })
  }

  for (const sub of submissions) {
    items.push({
      type: "SUBMISSION",
      at: sub.createdAt.toISOString(),
      stage: sub.stage,
      notes: sub.notes,
    })
  }

  for (const ra of reviewActions) {
    items.push({
      type: "REVIEW_ACTION",
      at: ra.createdAt.toISOString(),
      stage: ra.stage,
      decision: ra.decision,
      comments: ra.comments,
      grantAmount: ra.grantAmount,
      reviewerName: ra.reviewerId ? reviewerMap.get(ra.reviewerId) ?? null : null,
    })
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return NextResponse.json(items)
}
