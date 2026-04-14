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
import { fetchHackatimeProjectSeconds } from "@/lib/hackatime"

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
    where: { ...whereClause, deletedAt: null },
    include: {
      workSessions: {
        orderBy: { createdAt: "desc" },
        include: { media: true },
      },
      badges: true,
      bomItems: true,
      hackatimeProjects: true,
    },
    orderBy: { createdAt: "desc" },
  })

  // Fetch hackatimeUserId for firmware hour lookups
  const targetUserId = requestedUserId && isAdmin ? requestedUserId : session.user.id
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { hackatimeUserId: true },
  })

  // Fetch firmware hours for all linked hackatime projects in parallel
  const firmwareClaimedByProject = new Map<string, number>()
  const firmwareApprovedByProject = new Map<string, number>()
  if (user?.hackatimeUserId) {
    const allHackatimeProjects = projects.flatMap((p) =>
      p.hackatimeProjects.map((hp) => ({ stasisProjectId: p.id, hp }))
    )
    const results = await Promise.all(
      allHackatimeProjects.map(async ({ stasisProjectId, hp }) => {
        const totalSeconds = await fetchHackatimeProjectSeconds(user.hackatimeUserId!, hp.hackatimeProject)
        const claimed = hp.hoursApproved !== null ? hp.hoursApproved : totalSeconds / 3600
        const approved = hp.hoursApproved ?? 0
        return { stasisProjectId, claimed, approved }
      })
    )
    for (const { stasisProjectId, claimed, approved } of results) {
      firmwareClaimedByProject.set(stasisProjectId, (firmwareClaimedByProject.get(stasisProjectId) ?? 0) + claimed)
      firmwareApprovedByProject.set(stasisProjectId, (firmwareApprovedByProject.get(stasisProjectId) ?? 0) + approved)
    }
  }

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
    
    // First image from the most recent work session (sessions already sorted desc)
    const latestSessionImage = project.workSessions
      .flatMap(s => s.media)
      .find(m => m.type === "IMAGE")?.url ?? null

    return {
      ...project,
      status,
      latestSessionImage,
      totalHoursClaimed: project.workSessions.reduce(
        (acc, s) => acc + s.hoursClaimed,
        0
      ) + (firmwareClaimedByProject.get(project.id) ?? 0),
      totalHoursApproved: project.workSessions.reduce(
        (acc, s) => acc + (s.hoursApproved ?? 0),
        0
      ) + (firmwareApprovedByProject.get(project.id) ?? 0),
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
