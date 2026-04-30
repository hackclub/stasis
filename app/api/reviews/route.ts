import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission, hasRole, Role } from "@/lib/permissions"
import { getTierById } from "@/lib/tiers"
import { totalBomCost } from "@/lib/format"
import { decryptPII } from "@/lib/pii"

export async function GET(request: NextRequest) {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const isAdmin = hasRole(authCheck.roles, Role.ADMIN)
  const reviewerId = authCheck.session.user.id

  const url = request.nextUrl
  const search = url.searchParams.get("search") || ""
  const category = url.searchParams.get("category") || "" // DESIGN or BUILD
  const guide = url.searchParams.get("guide") || "" // starter project ID filter
  const nameSearch = url.searchParams.get("nameSearch") || "" // text search on title/description
  const sort = url.searchParams.get("sort") || "" // "most_hours" for descending hours sort
  const pronounsFilter = url.searchParams.get("pronouns") || "" // filter by user pronouns
  const prioritizeAttending = url.searchParams.get("prioritizeAttending") === "true"
  const regionFilter = url.searchParams.get("region") || "" // "na" or "eu"
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"))
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50")))
  const offset = (page - 1) * limit
  // Cursor pagination: "<isoDate>_<id>" of the last row from the previous page.
  // Used by the queue page's "Load more" button so we don't drag the whole queue.
  const cursorParam = url.searchParams.get("cursor") || ""
  const cursor = cursorParam.includes("_")
    ? (() => {
        const sep = cursorParam.indexOf("_")
        const ts = cursorParam.slice(0, sep)
        const cid = cursorParam.slice(sep + 1)
        const d = new Date(ts)
        return Number.isNaN(d.getTime()) || !cid ? null : { id: cid, updatedAt: d }
      })()
    : null

  // Query projects directly — works whether or not ProjectSubmission rows exist
  const showFraud = url.searchParams.get("showFraud") === "true"

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projectWhere: any = { deletedAt: null }

  // Exclude fraud-convicted users by default
  if (!showFraud) {
    projectWhere.user = { fraudConvicted: false }
  }

  // Filter by user pronouns
  if (pronounsFilter) {
    projectWhere.user = {
      ...projectWhere.user,
      pronouns: { contains: pronounsFilter, mode: "insensitive" },
    }
  }

  // Filter by stage/status
  if (category === "DESIGN") {
    projectWhere.designStatus = "in_review"
  } else if (category === "BUILD") {
    projectWhere.buildStatus = "in_review"
  } else {
    projectWhere.OR = [
      { designStatus: "in_review" },
      { buildStatus: "in_review" },
    ]
  }

  // Filter by starter project guide
  if (guide === "custom") {
    projectWhere.starterProjectId = null
  } else if (guide) {
    projectWhere.starterProjectId = guide
  }

  // Non-admins should not see pre-reviewed projects (those are waiting for admin finalization)
  if (!isAdmin) {
    projectWhere.submissions = {
      none: { preReviewed: true },
    }
  }

  // Name-based text search (e.g. "devboard" or "keyboard" in title/description)
  if (nameSearch) {
    const statusFilter = projectWhere.OR
    delete projectWhere.OR
    projectWhere.AND = [
      ...(statusFilter ? [{ OR: statusFilter }] : []),
      ...(projectWhere.AND || []),
      {
        OR: [
          { title: { contains: nameSearch, mode: "insensitive" } },
          { description: { contains: nameSearch, mode: "insensitive" } },
        ],
      },
    ]
  }

  // Search filter
  if (search) {
    // Wrap existing OR in AND to combine with search
    const statusFilter = projectWhere.OR
    delete projectWhere.OR
    projectWhere.AND = [
      ...(statusFilter ? [{ OR: statusFilter }] : []),
      ...(projectWhere.AND || []),
      {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { user: { name: { contains: search, mode: "insensitive" } } },
          { user: { email: { contains: search, mode: "insensitive" } } },
          { id: { contains: search } },
        ],
      },
    ]
  }

  // "stasis" is the in-person event; sorting eventPreference desc with nulls last floats
  // "stasis" above "prizes"/"opensauce"/null alphabetically — a convenient coincidence.
  const orderBy = prioritizeAttending
    ? [{ user: { eventPreference: { sort: "desc" as const, nulls: "last" as const } } }, { updatedAt: "asc" as const }]
    : [{ updatedAt: "asc" as const }]

  const findArgs = {
    where: projectWhere,
    include: {
      user: { select: { id: true, name: true, email: true, image: true, pronouns: true, encryptedAddressCountry: true, eventPreference: true } },
      workSessions: { select: { id: true, hoursClaimed: true, hoursApproved: true, createdAt: true } },
      bomItems: { select: { id: true, totalCost: true, status: true } },
      submissions: {
        select: { id: true, stage: true, preReviewed: true },
        orderBy: { createdAt: "desc" as const },
      },
    },
    orderBy,
  }

  // Region filter requires decrypting the country PII, which must happen in JS.
  // When active, fetch a capped batch and paginate in memory; otherwise keep DB-level pagination.
  // The 200-row cap keeps the queue snappy — if a region routinely overflows it we should add a regionCode column.
  const regionActive = regionFilter === "na" || regionFilter === "eu"
  const REGION_INMEMORY_CAP = 200
  if (regionActive) {
    console.warn(`[reviews] region filter active (${regionFilter}); fetching up to ${REGION_INMEMORY_CAP} rows in memory`)
  }
  // Cursor pagination only works with the simple updatedAt-asc ordering;
  // prioritizeAttending and region paths fall back to the legacy offset/in-memory paths.
  const useCursor = !!cursor && !regionActive && !prioritizeAttending
  const [projects, total] = regionActive
    ? [await prisma.project.findMany({ ...findArgs, take: REGION_INMEMORY_CAP }), 0] // total recomputed after region filter
    : useCursor
    ? await Promise.all([
        prisma.project.findMany({ ...findArgs, cursor: { id: cursor!.id }, skip: 1, take: limit }),
        prisma.project.count({ where: projectWhere }),
      ])
    : await Promise.all([
        prisma.project.findMany({ ...findArgs, skip: offset, take: limit }),
        prisma.project.count({ where: projectWhere }),
      ])

  // Transform for the frontend
  const itemsAll = projects.map((project) => {
    // Determine which stage is in review
    const designInReview = project.designStatus === "in_review"
    const buildInReview = project.buildStatus === "in_review"
    const activeStage = buildInReview ? "BUILD" : designInReview ? "DESIGN" : "DESIGN"

    // For build reviews, only count hours logged after design approval
    const relevantSessions = activeStage === "BUILD" && project.designReviewedAt
      ? project.workSessions.filter((s) => s.createdAt > project.designReviewedAt!)
      : project.workSessions
    const totalWorkUnits = relevantSessions.reduce((sum, s) => sum + s.hoursClaimed, 0)
    const allWorkUnits = project.workSessions.reduce((sum, s) => sum + s.hoursClaimed, 0)
    const entryCount = relevantSessions.length
    const bomCost = totalBomCost(project.bomItems, project.bomTax, project.bomShipping)

    // Check if the latest submission for the active stage has been pre-reviewed
    const activeSubmission = project.submissions.find((s) => s.stage === activeStage)
    const preReviewed = activeSubmission?.preReviewed ?? false

    const waitingMs = Date.now() - new Date(project.updatedAt).getTime()

    // Decrypt country once for both the she/her-US tag and the region filter.
    let country: string | null = null
    if (project.user.encryptedAddressCountry) {
      try {
        country = decryptPII(project.user.encryptedAddressCountry).toLowerCase().trim()
      } catch {
        // Decryption may fail if PII_ENCRYPTION_KEY is not set
      }
    }
    const isSheHer = !!project.user.pronouns && project.user.pronouns.toLowerCase().includes("she/her")
    const isUS = !!country && (country === "us" || country === "usa" || country === "united states" || country === "united states of america")
    const region = classifyRegion(country)
    const attendingEvent = project.user.eventPreference === "stasis"

    return {
      id: project.id,
      projectId: project.id,
      title: project.title,
      description: project.description,
      coverImage: project.coverImage,
      category: activeStage,
      tier: project.tier,
      author: { id: project.user.id, name: project.user.name, email: project.user.email, image: project.user.image },
      workUnits: Math.round(totalWorkUnits * 10) / 10,
      totalWorkUnits: Math.round(allWorkUnits * 10) / 10,
      entryCount,
      bomCost: Math.round(bomCost * 100) / 100,
      bomTax: project.bomTax ?? 0,
      bomShipping: project.bomShipping ?? 0,
      costPerUnit: totalWorkUnits > 0 ? Math.round((bomCost / totalWorkUnits) * 100) / 100 : 0,
      bitsPerHour: (() => {
        if (totalWorkUnits <= 0 || !project.tier) return null
        const tierInfo = getTierById(project.tier)
        return tierInfo ? Math.round((tierInfo.bits / totalWorkUnits) * 10) / 10 : null
      })(),
      waitingMs,
      createdAt: project.updatedAt,
      preReviewed,
      claimedByOther: false,
      claimedBySelf: false,
      claimerName: null,
      reviewCount: 0,
      starterProjectId: project.starterProjectId,
      sheHerUS: isSheHer && isUS,
      attendingEvent,
      region,
    }
  })

  // Apply region filter (post-decryption) and recompute pagination when active.
  const filtered = regionActive
    ? itemsAll.filter((it) => it.region === regionFilter)
    : itemsAll
  const filteredTotal = regionActive ? filtered.length : total

  // Sort by time waiting (longest first), with pre-reviewed items always on top
  if (sort === "most_hours") {
    filtered.sort((a, b) => b.workUnits - a.workUnits)
  } else {
    filtered.sort((a, b) => b.waitingMs - a.waitingMs)
  }

  // Prioritize attending-event users (stable-ish: applied before pre-reviewed so pre-reviewed still wins)
  if (prioritizeAttending) {
    filtered.sort((a, b) => {
      if (a.attendingEvent && !b.attendingEvent) return -1
      if (!a.attendingEvent && b.attendingEvent) return 1
      return 0
    })
  }

  // Always sort pre-reviewed (first-pass reviewed) items to the top
  filtered.sort((a, b) => {
    if (a.preReviewed && !b.preReviewed) return -1
    if (!a.preReviewed && b.preReviewed) return 1
    return 0
  })

  const items = regionActive ? filtered.slice(offset, offset + limit) : filtered

  // Build a cursor token from the last item so the client can request the next page.
  // Only emit on the simple path — region filter and prioritizeAttending re-sort in-memory
  // so a cursor wouldn't be a stable boundary.
  const lastItem = items[items.length - 1]
  const nextCursor =
    !regionActive && !prioritizeAttending && lastItem && items.length === limit
      ? `${new Date(lastItem.createdAt).toISOString()}_${lastItem.id}`
      : null

  return NextResponse.json({
    items,
    total: filteredTotal,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(filteredTotal / limit)),
    nextCursor,
    isAdmin,
  })
}

function classifyRegion(country: string | null): "na" | "eu" | "other" | null {
  if (!country) return null
  const c = country.toLowerCase().trim()
  if (NORTH_AMERICA.has(c)) return "na"
  if (EUROPE.has(c)) return "eu"
  return "other"
}

const NORTH_AMERICA = new Set([
  "us", "usa", "u.s.", "u.s.a.", "united states", "united states of america",
  "canada", "ca",
  "mexico", "mx",
])

const EUROPE = new Set([
  "gb", "uk", "u.k.", "united kingdom", "great britain", "england", "scotland", "wales", "northern ireland",
  "germany", "de", "deutschland",
  "france", "fr",
  "italy", "it",
  "spain", "es",
  "netherlands", "nl", "holland",
  "belgium", "be",
  "austria", "at",
  "switzerland", "ch",
  "sweden", "se",
  "norway", "no",
  "denmark", "dk",
  "finland", "fi",
  "ireland", "ie",
  "poland", "pl",
  "portugal", "pt",
  "czech republic", "czechia", "cz",
  "greece", "gr",
  "hungary", "hu",
  "romania", "ro",
  "bulgaria", "bg",
  "croatia", "hr",
  "slovenia", "si",
  "slovakia", "sk",
  "estonia", "ee",
  "latvia", "lv",
  "lithuania", "lt",
  "luxembourg", "lu",
  "malta", "mt",
  "cyprus", "cy",
  "iceland", "is",
  "liechtenstein", "li",
  "monaco", "andorra", "san marino", "vatican city",
  "ukraine", "ua",
  "moldova", "md",
  "serbia", "rs",
  "bosnia and herzegovina", "bosnia", "ba",
  "montenegro", "me",
  "north macedonia", "macedonia", "mk",
  "albania", "al",
  "kosovo", "xk",
])
