import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { ProjectTag, BadgeType } from "@/app/generated/prisma/enums"
import { sanitize } from "@/lib/sanitize"
import { normalizeUrl, isValidUrl } from "@/lib/url"
import { VALID_BADGE_TYPES, MAX_BADGES_PER_PROJECT } from "@/lib/badges"
import { VALID_TAGS } from "@/lib/tags"
import { getUserRoles, hasRole, Role } from "@/lib/permissions"
import { TIERS } from "@/lib/tiers"

function validateTags(tags: unknown): ProjectTag[] {
  if (!Array.isArray(tags)) return []
  return tags.filter((tag): tag is ProjectTag => VALID_TAGS.includes(tag as ProjectTag))
}

function validateBadges(badges: unknown): BadgeType[] {
  if (!Array.isArray(badges)) return []
  const validBadges = badges.filter((badge): badge is BadgeType => VALID_BADGE_TYPES.includes(badge as BadgeType))
  return validBadges.slice(0, MAX_BADGES_PER_PROJECT)
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const requestedUserId = searchParams.get("userId")

  const roles = await getUserRoles(session.user.id)
  const isAdmin = hasRole(roles, Role.ADMIN)

  let whereClause: { userId: string }
  if (requestedUserId && isAdmin) {
    whereClause = { userId: requestedUserId }
  } else {
    whereClause = { userId: session.user.id }
  }

  const projects = await prisma.project.findMany({
    where: whereClause,
    include: { workSessions: true, badges: true, bomItems: true },
    orderBy: { createdAt: "desc" },
  })

  const projectsWithHours = projects.map((project) => {
    // Derive a single status from designStatus and buildStatus for the card display
    let status: "draft" | "in_review" | "approved" | "rejected" = "draft"
    if (project.buildStatus === "approved") {
      status = "approved"
    } else if (project.buildStatus === "in_review") {
      status = "in_review"
    } else if (project.buildStatus === "rejected" || project.designStatus === "rejected") {
      status = "rejected"
    } else if (project.designStatus === "approved") {
      // Design approved, build not started or in draft
      if (project.buildStatus === "draft") {
        status = "approved"
      } else if (project.buildStatus === "update_requested") {
        status = "rejected" // Show as rejected for card display
      } else {
        status = project.buildStatus as "in_review" | "approved" | "rejected"
      }
    } else if (project.designStatus === "update_requested") {
      status = "rejected" // Show as rejected for card display
    } else if (project.designStatus === "in_review") {
      status = "in_review"
    }
    
    return {
      ...project,
      status,
      totalHoursClaimed: project.workSessions.reduce(
        (acc, s) => acc + s.hoursClaimed,
        0
      ),
      totalHoursApproved: project.workSessions.reduce(
        (acc, s) => acc + (s.hoursApproved ?? 0),
        0
      ),
    }
  })

  return NextResponse.json(projectsWithHours)
}

// TODO: Add rate limiting - prevent spam project creation
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { title, description, tags, badges, isStarter, starterProjectId, githubRepo, tier } = body

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 })
  }

  if (title.length > 200) {
    return NextResponse.json({ error: "Title too long" }, { status: 400 })
  }

  if (description && typeof description === "string" && description.length > 2000) {
    return NextResponse.json({ error: "Description too long" }, { status: 400 })
  }

  const validTierIds = TIERS.map(t => t.id)
  if (tier !== undefined && tier !== null) {
    if (!Number.isInteger(tier) || !validTierIds.includes(tier)) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 })
    }
  }

  const validatedBadges = validateBadges(badges)

  const existingBadges = await prisma.projectBadge.findMany({
    where: { 
      badge: { in: validatedBadges },
      project: { userId: session.user.id },
    },
    select: { badge: true },
  })

  if (existingBadges.length > 0) {
    const taken = existingBadges.map(b => b.badge).join(", ")
    return NextResponse.json({ error: `Badge(s) already in use: ${taken}` }, { status: 400 })
  }

  let sanitizedGithubRepo: string | null = null
  if (typeof githubRepo === "string" && githubRepo.trim()) {
    const normalized = normalizeUrl(githubRepo.trim())
    if (isValidUrl(normalized)) {
      sanitizedGithubRepo = sanitize(normalized)
    }
  }

  const project = await prisma.project.create({
    data: {
      title: sanitize(title.trim()),
      description: typeof description === "string" ? sanitize(description.trim()) : null,
      tags: validateTags(tags),
      isStarter: Boolean(isStarter),
      starterProjectId: typeof starterProjectId === "string" ? sanitize(starterProjectId) : null,
      githubRepo: sanitizedGithubRepo,
      tier: tier ?? null,
      userId: session.user.id,
      badges: {
        create: validatedBadges.map(badge => ({
          badge,
        }))
      },
    },
    include: { badges: true },
  })

  return NextResponse.json(project)
}
