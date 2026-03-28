import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { getUserRoles, hasRole, Role } from "@/lib/permissions"

type TimelineUser = {
  name: string | null
  image: string | null
}

export type TimelineItem =
  | {
      type: "PROJECT_CREATED"
      at: string
      projectId: string
      user: TimelineUser
    }
  | {
      type: "WORK_SESSION"
      at: string
      user: TimelineUser
      session: {
        id: string
        title: string
        hoursClaimed: number
        hoursApproved: number | null
        content: string | null
        stage: "DESIGN" | "BUILD"
        media: { id: string; type: "IMAGE" | "VIDEO"; url: string }[]
        timelapses: { timelapseId: string; name: string | null; thumbnailUrl: string | null }[]
      }
    }
  | {
      type: "SUBMISSION"
      at: string
      stage: "DESIGN" | "BUILD"
      notes: string | null
      user: TimelineUser
    }
  | {
      type: "REVIEW_ACTION"
      at: string
      stage: "DESIGN" | "BUILD"
      decision: "APPROVED" | "CHANGE_REQUESTED" | "REJECTED"
      comments: string | null
      grantAmount: number | null
      tier: number | null
      tierBefore: number | null
      reviewerName: string | null
      reviewerImage: string | null
      reviewerSlackId: string | null
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
      deletedAt: true,
      createdAt: true,
      userId: true,
      user: {
        select: {
          name: true,
          slackDisplayName: true,
          image: true,
        },
      },
    },
  })

  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const roles = await getUserRoles(session.user.id)
  const isAdmin = hasRole(roles, Role.ADMIN)
  const isReviewer = hasRole(roles, Role.REVIEWER)
  const isPrivileged = isAdmin || isReviewer

  if (project.userId !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const projectUser: { name: string | null; image: string | null } = {
    name: project.user.slackDisplayName || project.user.name,
    image: project.user.image,
  }

  const [workSessions, submissions, reviewActions] = await Promise.all([
    prisma.workSession.findMany({
      where: { projectId: id },
      include: { media: true, timelapses: true },
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
        select: { id: true, name: true, image: true, slackDisplayName: true, slackId: true },
      })
    : []

  let reviewerMap: Map<string, { name: string | null; image: string | null; slackId: string | null }>

  if (isPrivileged) {
    reviewerMap = new Map(reviewers.map((r) => [r.id, { name: r.name, image: r.image, slackId: r.slackId }]))
  } else {
    // For non-admin/non-reviewer users, show Slack display name only for privacy
    reviewerMap = new Map(
      reviewers.map((r) => [r.id, { name: r.slackDisplayName || "Reviewer", image: null, slackId: r.slackId }])
    )
  }

  const items: TimelineItem[] = []

  items.push({
    type: "PROJECT_CREATED",
    at: project.createdAt.toISOString(),
    projectId: project.id,
    user: projectUser,
  })

  for (const ws of workSessions) {
    items.push({
      type: "WORK_SESSION",
      at: ws.createdAt.toISOString(),
      user: projectUser,
      session: {
        id: ws.id,
        title: ws.title,
        hoursClaimed: ws.hoursClaimed,
        hoursApproved: ws.hoursApproved,
        content: ws.content,
        stage: ws.stage,
        media: ws.media.map((m) => ({
          id: m.id,
          type: m.type,
          url: m.url,
        })),
        timelapses: ws.timelapses.map((t) => ({
          timelapseId: t.timelapseId,
          name: t.name,
          thumbnailUrl: t.thumbnailUrl,
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
      user: projectUser,
    })
  }

  for (const ra of reviewActions) {
    const reviewer = ra.reviewerId ? reviewerMap.get(ra.reviewerId) : null
    items.push({
      type: "REVIEW_ACTION",
      at: ra.createdAt.toISOString(),
      stage: ra.stage,
      decision: ra.decision,
      comments: ra.comments,
      grantAmount: ra.grantAmount,
      tier: ra.tier,
      tierBefore: ra.tierBefore,
      reviewerName: reviewer?.name ?? null,
      reviewerImage: reviewer?.image ?? null,
      reviewerSlackId: reviewer?.slackId ?? null,
    })
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return NextResponse.json(items)
}
