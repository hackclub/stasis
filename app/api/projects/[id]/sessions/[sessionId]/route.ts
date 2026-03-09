import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { SessionCategory, MediaType } from "@/app/generated/prisma/enums"
import { sanitize } from "@/lib/sanitize"
import { isValidUrl } from "@/lib/url"
import { getUserRoles, hasRole, Role } from "@/lib/permissions"

const VALID_CATEGORIES: SessionCategory[] = [
  "FIRMWARE",
  "DESIGN_PLANNING",
  "PHYSICAL_BUILDING",
  "SCHEMATIC",
  "PCB_DESIGN",
  "CADING",
]

function validateCategories(categories: unknown): SessionCategory[] {
  if (!Array.isArray(categories)) return []
  return categories.filter((cat): cat is SessionCategory =>
    VALID_CATEGORIES.includes(cat as SessionCategory)
  )
}

interface MediaInput {
  type: "IMAGE" | "VIDEO"
  url: string
}

function validateMedia(media: unknown): MediaInput[] {
  if (!Array.isArray(media)) return []
  return media.filter(
    (m): m is MediaInput =>
      typeof m === "object" &&
      m !== null &&
      (m.type === "IMAGE" || m.type === "VIDEO") &&
      typeof m.url === "string" &&
      m.url.length > 0 &&
      isValidUrl(m.url)
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: projectId, sessionId } = await params

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const roles = await getUserRoles(session.user.id)
  const isAdmin = hasRole(roles, Role.ADMIN)

  if (project.userId !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const workSession = await prisma.workSession.findUnique({
    where: { id: sessionId, projectId },
    include: { media: true, timelapses: true },
  })

  if (!workSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }

  return NextResponse.json(workSession)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: projectId, sessionId } = await params

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true, designStatus: true, buildStatus: true },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const existingSession = await prisma.workSession.findUnique({
    where: { id: sessionId, projectId },
    include: { timelapses: true },
  })

  if (!existingSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }

  // Check if the appropriate stage is in review
  if (existingSession.stage === "DESIGN" && project.designStatus === "in_review") {
    return NextResponse.json({ error: "Cannot edit design sessions while design is in review" }, { status: 403 })
  }
  if (existingSession.stage === "BUILD" && project.buildStatus === "in_review") {
    return NextResponse.json({ error: "Cannot edit build sessions while build is in review" }, { status: 403 })
  }

  if (existingSession.hoursApproved !== null) {
    return NextResponse.json({ error: "Cannot edit approved sessions" }, { status: 403 })
  }

  const body = await request.json()
  const { title, hoursClaimed, content, categories, media, timelapseIds } = body

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json(
      { error: "Title is required" },
      { status: 400 }
    )
  }

  if (title.length > 200) {
    return NextResponse.json(
      { error: "Title too long (max 200 characters)" },
      { status: 400 }
    )
  }

  if (typeof hoursClaimed !== "number" || hoursClaimed <= 0 || hoursClaimed > 24) {
    return NextResponse.json(
      { error: "Hours must be between 0 and 24" },
      { status: 400 }
    )
  }

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json(
      { error: "Journal content is required" },
      { status: 400 }
    )
  }

  if (content.length > 50000) {
    return NextResponse.json(
      { error: "Content too long (max 50000 characters)" },
      { status: 400 }
    )
  }

  const validatedCategories = validateCategories(categories)
  if (validatedCategories.length === 0) {
    return NextResponse.json(
      { error: "At least one category is required" },
      { status: 400 }
    )
  }

  const validatedMedia = validateMedia(media)
  const imageCount = validatedMedia.filter((m) => m.type === "IMAGE").length
  const videoCount = validatedMedia.filter((m) => m.type === "VIDEO").length

  if (imageCount === 0) {
    return NextResponse.json(
      { error: "At least one image is required" },
      { status: 400 }
    )
  }

  const requiredVideos = Math.floor(hoursClaimed / 10)
  if (requiredVideos > 0 && videoCount < requiredVideos) {
    return NextResponse.json(
      {
        error: `Sessions over 10 hours require video clips. You need ${requiredVideos} video ${requiredVideos !== 1 ? 'clips' : 'clip'} for ${hoursClaimed} ${hoursClaimed === 1 ? 'hour' : 'hours'}.`,
      },
      { status: 400 }
    )
  }

  const validatedTimelapseIds: string[] = Array.isArray(timelapseIds)
    ? timelapseIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
    : existingSession.timelapses.map((t) => t.timelapseId)

  const existingTimelapseIds = existingSession.timelapses.map((t) => t.timelapseId)
  const toDelete = existingTimelapseIds.filter((id) => !validatedTimelapseIds.includes(id))
  const toAdd = validatedTimelapseIds.filter((id) => !existingTimelapseIds.includes(id))

  if (toDelete.length > 0) {
    await prisma.sessionTimelapse.deleteMany({
      where: { workSessionId: sessionId, timelapseId: { in: toDelete } },
    })
  }

  const timelapseMetas = await Promise.all(
    toAdd.map(async (timelapseId) => {
      try {
        const res = await fetch(
          `https://api.lapse.hackclub.com/api/timelapse/query?id=${encodeURIComponent(timelapseId)}`
        )
        if (!res.ok) return { timelapseId, name: null, thumbnailUrl: null, playbackUrl: null, duration: null, workSessionId: sessionId }
        const data = await res.json()
        return {
          timelapseId,
          workSessionId: sessionId,
          name: (data.name ?? data.title ?? null) as string | null,
          thumbnailUrl: (data.thumbnailUrl ?? data.thumbnail ?? null) as string | null,
          playbackUrl: (data.playbackUrl ?? data.url ?? null) as string | null,
          duration: typeof data.duration === "number" ? data.duration : null,
        }
      } catch {
        return { timelapseId, name: null, thumbnailUrl: null, playbackUrl: null, duration: null, workSessionId: sessionId }
      }
    })
  )

  if (timelapseMetas.length > 0) {
    await prisma.sessionTimelapse.createMany({ data: timelapseMetas })
  }

  await prisma.sessionMedia.deleteMany({
    where: { workSessionId: sessionId },
  })

  const workSessionUpdated = await prisma.workSession.update({
    where: { id: sessionId },
    data: {
      title: sanitize(title.trim()),
      hoursClaimed,
      content: sanitize(content.trim()),
      categories: validatedCategories,
      media: {
        create: validatedMedia.map((m) => ({
          type: m.type as MediaType,
          url: m.url,
        })),
      },
    },
    include: { media: true, timelapses: true },
  })

  return NextResponse.json(workSessionUpdated)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: projectId, sessionId } = await params

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true, designStatus: true, buildStatus: true },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const existingSession = await prisma.workSession.findUnique({
    where: { id: sessionId, projectId },
  })

  if (!existingSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }

  // Check if the appropriate stage is in review
  if (existingSession.stage === "DESIGN" && project.designStatus === "in_review") {
    return NextResponse.json({ error: "Cannot delete design sessions while design is in review" }, { status: 403 })
  }
  if (existingSession.stage === "BUILD" && project.buildStatus === "in_review") {
    return NextResponse.json({ error: "Cannot delete build sessions while build is in review" }, { status: 403 })
  }

  if (existingSession.hoursApproved !== null) {
    return NextResponse.json({ error: "Cannot delete approved sessions" }, { status: 403 })
  }

  await prisma.workSession.delete({
    where: { id: sessionId },
  })

  return NextResponse.json({ success: true })
}
