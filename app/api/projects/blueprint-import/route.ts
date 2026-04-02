import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { sanitize } from "@/lib/sanitize"
import { parseBlueprintMarkdown } from "@/lib/blueprint-parser"
import { isValidUrl, normalizeUrl } from "@/lib/url"
import { TIERS } from "@/lib/tiers"
import { MediaType } from "@/app/generated/prisma/enums"

const BLUEPRINT_API_URL = process.env.BLUEPRINT_API_URL
const BLUEPRINT_API_KEY = process.env.BLUEPRINT_API_KEY

function blueprintBaseUrl(): string {
  if (!BLUEPRINT_API_URL) return ""
  return BLUEPRINT_API_URL.endsWith("/") ? BLUEPRINT_API_URL.slice(0, -1) : BLUEPRINT_API_URL
}

function absolutizeImageUrls(content: string): string {
  const base = blueprintBaseUrl()
  if (!base) return content
  // Replace ![alt](/path) with ![alt](https://host/path)
  return content.replace(
    /(!\[[^\]]*\]\()(\/)([^)]*\))/g,
    "$1" + base + "/$3"
  )
}

async function fetchBlueprintProjects(email: string): Promise<string> {
  if (!BLUEPRINT_API_URL || !BLUEPRINT_API_KEY) {
    throw new Error("Blueprint API not configured")
  }

  const url = new URL("/api/unfinished_projects", BLUEPRINT_API_URL)
  url.searchParams.set("email", email)

  const res = await fetch(url.toString(), {
    headers: { Authorization: "Bearer " + BLUEPRINT_API_KEY },
    cache: "no-store",
  })

  if (!res.ok) {
    throw new Error("Blueprint API returned " + res.status)
  }

  return res.text()
}

interface ParsedSession {
  title: string
  hoursClaimed: number
  content: string
  images: string[]
  createdAt: Date
}

function parseJournalMarkdown(markdown: string): ParsedSession[] {
  const sections = markdown.split(/^# /m).filter((s) => s.trim().length > 0)
  const sessions: ParsedSession[] = []

  for (const section of sections) {
    if (section.startsWith("<!--") || section.trim().startsWith("<!--")) continue

    const lines = section.split("\n")
    const headingLine = lines[0]?.trim()
    if (!headingLine) continue

    const dashIndex = headingLine.indexOf(" - ")
    if (dashIndex === -1) continue

    const dateTimePart = headingLine.substring(0, dashIndex).trim()
    const title = headingLine.substring(dashIndex + 3).trim()
    if (!title) continue

    const dateMatch = dateTimePart.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM))?$/i
    )
    if (!dateMatch) continue
    const [, month, day, year, rawHour, minutes, ampm] = dateMatch
    let hour = 12
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

    const rawContent = contentLines.join("\n").trim()
    const fixedContent = absolutizeImageUrls(rawContent)

    // Extract image URLs (now absolute) using non-whitespace match for URLs with parens
    const imageRegex = /!\[[^\]]*\]\((\S+)\)/g
    const images: string[] = []
    let match
    while ((match = imageRegex.exec(fixedContent)) !== null) {
      if (isValidUrl(match[1])) {
        images.push(match[1])
      }
    }

    sessions.push({ title, hoursClaimed, content: fixedContent, images, createdAt })
  }

  return sessions
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!BLUEPRINT_API_URL || !BLUEPRINT_API_KEY) {
    return NextResponse.json({ imports: [] })
  }

  try {
    const markdown = await fetchBlueprintProjects(session.user.email)
    const parsed = parseBlueprintMarkdown(markdown)

    for (const project of parsed) {
      if (project.id === 0) continue

      const existing = await prisma.blueprintImport.findUnique({
        where: {
          userId_blueprintProjectId: {
            userId: session.user.id,
            blueprintProjectId: project.id,
          },
        },
      })

      if (!existing) {
        await prisma.blueprintImport.create({
          data: {
            userId: session.user.id,
            blueprintProjectId: project.id,
            blueprintTitle: sanitize(project.title),
            status: "pending",
            rawData: {
              title: project.title,
              description: project.description,
              tier: project.tier,
              repoLink: project.repoLink,
              demoLink: project.demoLink,
              projectType: project.projectType,
              ysws: project.ysws,
              hoursLogged: project.hoursLogged,
              createdAt: project.createdAt,
              journalMarkdown: project.journalMarkdown,
            },
          },
        })
      }
    }
  } catch (err) {
    console.error("Blueprint import fetch error:", err)
  }

  const imports = await prisma.blueprintImport.findMany({
    where: { userId: session.user.id, status: "pending" },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ imports })
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { importId } = body

  if (!importId || typeof importId !== "string") {
    return NextResponse.json({ error: "importId is required" }, { status: 400 })
  }

  const importRecord = await prisma.blueprintImport.findUnique({
    where: { id: importId },
  })

  if (!importRecord || importRecord.userId !== session.user.id) {
    return NextResponse.json({ error: "Import not found" }, { status: 404 })
  }

  if (importRecord.status !== "pending") {
    return NextResponse.json({ error: "Import already processed" }, { status: 400 })
  }

  const raw = importRecord.rawData as {
    title: string
    description: string | null
    tier: number | null
    repoLink: string | null
    journalMarkdown: string | null
  } | null

  if (!raw) {
    return NextResponse.json({ error: "No data to import" }, { status: 400 })
  }

  const validTierIds = TIERS.map(t => t.id) as number[]
  const tier = raw.tier !== null && Number.isInteger(raw.tier) && validTierIds.includes(raw.tier) ? raw.tier : null

  let githubRepo: string | null = null
  if (raw.repoLink && typeof raw.repoLink === "string") {
    const normalized = normalizeUrl(raw.repoLink.trim())
    if (isValidUrl(normalized)) {
      githubRepo = sanitize(normalized)
    }
  }

  // Create the project
  const project = await prisma.project.create({
    data: {
      title: sanitize(raw.title),
      description: raw.description ? sanitize(raw.description) : null,
      githubRepo,
      tier,
      userId: session.user.id,
    },
  })

  // Import journal entries as work sessions
  let importedSessions = 0
  if (raw.journalMarkdown) {
    const parsedSessions = parseJournalMarkdown(raw.journalMarkdown)
    if (parsedSessions.length > 0) {
      const cappedSessions = parsedSessions.filter(s => s.hoursClaimed <= 100)
      await prisma.$transaction(
        cappedSessions.map((entry) =>
          prisma.workSession.create({
            data: {
              title: sanitize(entry.title.trim()),
              hoursClaimed: entry.hoursClaimed,
              content: sanitize(entry.content),
              categories: [],
              stage: "DESIGN",
              projectId: project.id,
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
      importedSessions = cappedSessions.length
    }
  }

  await prisma.blueprintImport.update({
    where: { id: importId },
    data: {
      status: "accepted",
      stasisProjectId: project.id,
    },
  })

  return NextResponse.json({ project, importedSessions })
}

export async function DELETE(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const importId = searchParams.get("importId")

  if (!importId) {
    return NextResponse.json({ error: "importId is required" }, { status: 400 })
  }

  const importRecord = await prisma.blueprintImport.findUnique({
    where: { id: importId },
  })

  if (!importRecord || importRecord.userId !== session.user.id) {
    return NextResponse.json({ error: "Import not found" }, { status: 404 })
  }

  await prisma.blueprintImport.update({
    where: { id: importId },
    data: { status: "declined" },
  })

  return NextResponse.json({ success: true })
}
