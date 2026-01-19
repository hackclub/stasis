import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { SessionCategory, MediaType, ProjectStage } from "@/app/generated/prisma/enums"
import { sanitize } from "@/lib/sanitize"

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
      m.url.length > 0
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

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  })

  if (project.userId !== session.user.id && !user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const workSessions = await prisma.workSession.findMany({
    where: { projectId },
    include: { media: true },
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
  const { hoursClaimed, content, categories, media, stage: rawStage } = body
  
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

  const requiredVideos = Math.floor(hoursClaimed / 4)
  if (requiredVideos > 0 && videoCount < requiredVideos) {
    return NextResponse.json(
      {
        error: `Sessions over 4 hours require video clips. You need ${requiredVideos} video(s) for ${hoursClaimed} hours.`,
      },
      { status: 400 }
    )
  }

  const workSession = await prisma.workSession.create({
    data: {
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
    },
    include: { media: true },
  })

  return NextResponse.json(workSession)
}
