import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { MediaType, ProjectStage } from "@/app/generated/prisma/enums"
import { sanitize } from "@/lib/sanitize"
import { isValidUrl } from "@/lib/url"

interface ParsedSession {
  title: string
  hoursClaimed: number
  content: string
  images: string[]
  createdAt: Date
}

function parseMarkdown(markdown: string): ParsedSession[] {
  const sections = markdown.split(/^# /m).filter((s) => s.trim().length > 0)

  const sessions: ParsedSession[] = []

  for (const section of sections) {
    if (section.startsWith("<!--") || section.trim().startsWith("<!--")) {
      continue
    }

    const lines = section.split("\n")
    const headingLine = lines[0]?.trim()
    if (!headingLine) continue

    // Parse heading: "{date} {time} - {title}"
    const dashIndex = headingLine.indexOf(" - ")
    if (dashIndex === -1) continue

    const dateTimePart = headingLine.substring(0, dashIndex).trim()
    const title = headingLine.substring(dashIndex + 3).trim()
    if (!title) continue

    // Parse date like "1/27/2026 9 AM", "2/22/2026 5:01 AM", "1/27/2026 10 PM", or "12/22/2025" (no time)
    const dateMatch = dateTimePart.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM))?$/i
    )
    if (!dateMatch) continue
    const [, month, day, year, rawHour, minutes, ampm] = dateMatch
    let hour = 12 // default to noon when no time specified
    if (rawHour) {
      hour = parseInt(rawHour)
      if (ampm?.toUpperCase() === "PM" && hour !== 12) hour += 12
      if (ampm?.toUpperCase() === "AM" && hour === 12) hour = 0
    }
    const createdAt = new Date(
      parseInt(year), parseInt(month) - 1, parseInt(day),
      hour, parseInt(minutes || "0")
    )
    if (isNaN(createdAt.getTime())) continue

    // Parse hours from "_Time spent: Xh_"
    let hoursClaimed = 0
    const contentLines: string[] = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      const hoursMatch = line.match(/^_Time spent:\s*([\d.]+)h_\s*$/)
      if (hoursMatch) {
        hoursClaimed = parseFloat(hoursMatch[1])
      } else {
        contentLines.push(line)
      }
    }

    if (hoursClaimed <= 0) continue

    const content = contentLines.join("\n").trim()

    // Extract images from ![alt](url) patterns
    const imageRegex = /!\[[^\]]*\]\(([^)]+)\)/g
    const images: string[] = []
    let match
    while ((match = imageRegex.exec(content)) !== null) {
      const url = match[1]
      if (isValidUrl(url)) {
        images.push(url)
      }
    }

    sessions.push({
      title,
      hoursClaimed,
      content,
      images,
      createdAt,
    })
  }

  return sessions
}

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
    select: { userId: true, deletedAt: true, designStatus: true, buildStatus: true },
  })

  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const stage: ProjectStage =
    project.designStatus === "approved" ? "BUILD" : "DESIGN"

  if (stage === "DESIGN" && project.designStatus === "in_review") {
    return NextResponse.json(
      { error: "Cannot add design sessions while design is in review" },
      { status: 403 }
    )
  }
  if (stage === "BUILD" && project.buildStatus === "in_review") {
    return NextResponse.json(
      { error: "Cannot add build sessions while build is in review" },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { markdown, dryRun } = body

  if (!markdown || typeof markdown !== "string" || markdown.trim().length === 0) {
    return NextResponse.json(
      { error: "Markdown content is required" },
      { status: 400 }
    )
  }

  const parsedSessions = parseMarkdown(markdown)

  if (parsedSessions.length === 0) {
    return NextResponse.json(
      { error: "No valid sessions found in markdown" },
      { status: 400 }
    )
  }

  // Cap individual sessions at 24 hours
  for (const entry of parsedSessions) {
    if (entry.hoursClaimed > 24) {
      return NextResponse.json(
        { error: `Session "${entry.title}" exceeds 24-hour per-session limit (${entry.hoursClaimed}h)` },
        { status: 400 }
      )
    }
  }

  const MAX_PROJECT_HOURS = 100
  const existingHours = await prisma.workSession.aggregate({
    where: { projectId },
    _sum: { hoursClaimed: true },
  })
  const importTotal = parsedSessions.reduce((sum, s) => sum + s.hoursClaimed, 0)
  const totalAfter = (existingHours._sum.hoursClaimed ?? 0) + importTotal
  if (totalAfter > MAX_PROJECT_HOURS) {
    return NextResponse.json(
      { error: `Import would bring total to ${totalAfter}h, exceeding the ${MAX_PROJECT_HOURS}h project limit. Current total: ${existingHours._sum.hoursClaimed ?? 0}h.` },
      { status: 400 }
    )
  }

  if (dryRun) {
    return NextResponse.json({ count: parsedSessions.length })
  }

  const created = await prisma.$transaction(
    parsedSessions.map((entry) =>
      prisma.workSession.create({
        data: {
          title: sanitize(entry.title.trim()),
          hoursClaimed: entry.hoursClaimed,
          content: sanitize(entry.content),
          categories: [],
          stage,
          projectId,
          createdAt: entry.createdAt,
          media: {
            create: entry.images.map((url) => ({
              type: "IMAGE" as MediaType,
              url: sanitize(url),
            })),
          },
        },
      })
    )
  )

  return NextResponse.json({ imported: created.length })
}
