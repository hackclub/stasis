import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { SessionCategory, MediaType, ProjectStage } from "@/app/generated/prisma/enums"
import { sanitize } from "@/lib/sanitize"
import { isValidUrl } from "@/lib/url"
import { getUserRoles, hasRole, Role } from "@/lib/permissions"

const VALID_STAGES: ProjectStage[] = ["DESIGN", "BUILD"]

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
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: projectId } = await params

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

  const workSessions = await prisma.workSession.findMany({
    where: { projectId },
    include: { media: true, timelapses: true },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(workSessions)
}

// TODO: Add rate limiting - prevent session logging spam
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: projectId } = await params

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

  const body = await request.json()

  // const todayStart = new Date()
  // todayStart.setHours(0, 0, 0, 0)
  // const dailySessionCount = await prisma.workSession.count({
  //   where: {
  //     project: { userId: session.user.id },
  //     createdAt: { gte: todayStart },
  //   },
  // })
  // if (dailySessionCount >= 10) {
  //   return NextResponse.json(
  //     { error: "Daily session limit reached (max 10 per day)" },
  //     { status: 429 }
  //   )
  // }

  const { title, hoursClaimed, content, categories, media, stage: rawStage, timelapseIds } = body
  
  // Determine stage - default to BUILD if design is approved, otherwise DESIGN
  const stage: ProjectStage = VALID_STAGES.includes(rawStage) 
    ? rawStage 
    : (project.designStatus === "approved" ? "BUILD" : "DESIGN")

  // Prevent adding sessions for a stage that's in review
  if (stage === "DESIGN" && project.designStatus === "in_review") {
    return NextResponse.json({ error: "Cannot add design sessions while design is in review" }, { status: 403 })
  }
  if (stage === "BUILD" && project.buildStatus === "in_review") {
    return NextResponse.json({ error: "Cannot add build sessions while build is in review" }, { status: 403 })
  }
  
  // Can only add BUILD sessions if design is approved
  if (stage === "BUILD" && project.designStatus !== "approved") {
    return NextResponse.json({ error: "Design must be approved before logging build sessions" }, { status: 403 })
  }

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
    : []



  const timelapseMetas = await Promise.all(
    validatedTimelapseIds.map(async (timelapseId) => {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)
        const res = await fetch(
          `https://lapse.hackclub.com/timelapse/query?id=${encodeURIComponent(timelapseId)}`,
          { signal: controller.signal }
        )
        clearTimeout(timeout)
        if (!res.ok) return { timelapseId, name: null, thumbnailUrl: null, playbackUrl: null, duration: null }
        const data = await res.json()
        return {
          timelapseId,
          name: (data.name ?? data.title ?? null) as string | null,
          thumbnailUrl: (data.thumbnailUrl ?? data.thumbnail ?? null) as string | null,
          playbackUrl: (data.playbackUrl ?? data.url ?? null) as string | null,
          duration: typeof data.duration === "number" ? data.duration : null,
        }
      } catch {
        return { timelapseId, name: null, thumbnailUrl: null, playbackUrl: null, duration: null }
      }
    })
  )

  const workSession = await prisma.workSession.create({
    data: {
      title: sanitize(title.trim()),
      hoursClaimed,
      content: sanitize(content.trim()),
      categories: validatedCategories,
      stage,
      projectId,
      media: {
        create: validatedMedia.map((m) => ({
          type: m.type as MediaType,
          url: m.url,
        })),
      },
      ...(timelapseMetas.length > 0 && {
        timelapses: {
          create: timelapseMetas,
        },
      }),
    },
    include: { media: true, timelapses: true },
  })

  return NextResponse.json(workSession)
}
