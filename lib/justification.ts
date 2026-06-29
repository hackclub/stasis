import prisma from "@/lib/prisma"
import { getTierById } from "@/lib/tiers"

export type JustificationStage = "DESIGN" | "BUILD"

export interface BuildJustificationInput {
  /** Project the justification is being generated for. */
  projectId: string
  /** Stage being approved. */
  stage: JustificationStage
  /**
   * Display name of the reviewer/admin finalizing this (second-pass) decision.
   * Omit on a re-sync (no live reviewer) and the latest persisted second-pass
   * review is resolved from the database instead.
   */
  reviewerName?: string
  /**
   * Internal justification text from the finalizing reviewer (why the project
   * was approved / how hours were decided). This is NOT the user-facing
   * feedback — it is the reviewer's internal reasoning. May be null. Ignored
   * unless `reviewerName` is also provided.
   */
  justification?: string | null
  /** Approved-hours override, if the reviewer deflated/inflated the claimed hours. */
  workUnitsOverride?: number | null
  /** Base URL for the journal link. Defaults to BETTER_AUTH_URL. */
  baseUrl?: string
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Build the "Override Hours Spent Justification" text that gets synced to the
 * YSWS Airtable. This is the single source of truth for justification text —
 * every approval path (reviewer-submit, admin-decision, manual re-sync) calls
 * this so the output stays consistent.
 *
 * Key rules:
 *  - The second-pass section uses the reviewer's INTERNAL justification, never
 *    the user-facing feedback.
 *  - Links are never immediately followed by a period, so they stay clickable
 *    in Airtable.
 *  - Linked Hackatime projects are listed by name (with per-project approved
 *    hours when set).
 */
export async function buildHoursJustification(input: BuildJustificationInput): Promise<string> {
  const { projectId, stage, workUnitsOverride } = input
  const baseUrl = input.baseUrl || process.env.BETTER_AUTH_URL || "http://localhost:3000"
  const isBuild = stage === "BUILD"

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      user: { select: { name: true, hackatimeUserId: true } },
      workSessions: true,
      bomItems: true,
      badges: true,
      hackatimeProjects: true,
    },
  })
  if (!project) throw new Error(`buildHoursJustification: project ${projectId} not found`)

  const designSessions = project.workSessions.filter((s) => s.stage === "DESIGN")
  const buildSessions = project.workSessions.filter((s) => s.stage === "BUILD")
  const relevantSessions = isBuild ? buildSessions : designSessions
  const journalHours = relevantSessions.reduce((sum, s) => sum + s.hoursClaimed, 0)
  const journalCount = relevantSessions.length
  const designHours = designSessions.reduce((sum, s) => sum + s.hoursClaimed, 0)

  // Hackatime: total hours (live-fetched when not yet reviewed) for the summary
  // line, plus the per-project list.
  let hackatimeHours = 0
  if (project.hackatimeProjects.length > 0 && project.user?.hackatimeUserId) {
    try {
      const { fetchHackatimeProjectSeconds } = await import("@/lib/hackatime")
      for (const hp of project.hackatimeProjects) {
        if (hp.hoursApproved !== null) {
          hackatimeHours += hp.hoursApproved
        } else {
          const secs = await fetchHackatimeProjectSeconds(project.user.hackatimeUserId, hp.hackatimeProject)
          hackatimeHours += secs / 3600
        }
      }
    } catch {
      // A Hackatime API hiccup must not block approval/sync — fall back to
      // whatever per-project approved hours we already have.
      hackatimeHours = project.hackatimeProjects.reduce((sum, hp) => sum + (hp.hoursApproved ?? 0), 0)
    }
  }
  hackatimeHours = Math.round(hackatimeHours * 10) / 10

  // Timelapse hours across the relevant sessions
  const sessionIds = relevantSessions.map((s) => s.id)
  const timelapses = sessionIds.length > 0
    ? await prisma.sessionTimelapse.findMany({
        where: { workSessionId: { in: sessionIds } },
        select: { duration: true },
      })
    : []
  const timelapseHours = Math.round(timelapses.reduce((sum, t) => sum + (t.duration ?? 0), 0) / 3600 * 10) / 10

  const tierInfo = project.tier ? getTierById(project.tier) : null

  const lines: string[] = []
  const push = (s = "") => lines.push(s)

  push(isBuild ? `**Build Review**` : `**Design Review**`)
  push()
  push(`Project: "${project.title}" (${isBuild ? "build" : "design"} approval)`)
  push(`User: ${project.user?.name || "Unknown"}`)
  if (tierInfo) {
    push(`Tier: ${tierInfo.name} (${tierInfo.bits} bits, ${tierInfo.minHours}-${tierInfo.maxHours === Infinity ? "67+" : tierInfo.maxHours}h range)`)
  }
  push()

  const hoursParts: string[] = [`${journalHours.toFixed(1)} hours across ${journalCount} journal entr${journalCount === 1 ? "y" : "ies"}`]
  if (hackatimeHours > 0) hoursParts.push(`${hackatimeHours} hours of hackatime`)
  if (timelapseHours > 0) hoursParts.push(`${timelapseHours} hours of lapse`)
  push(`This user logged ${hoursParts.join(", ")}.`)

  // Hours deflation: an explicit reviewer override (workUnitsOverride) takes
  // precedence; otherwise fall back to the per-session approved totals.
  const approvedFromSessions = relevantSessions.reduce((sum, s) => sum + (s.hoursApproved ?? s.hoursClaimed), 0)
  const approvedHours = workUnitsOverride != null ? workUnitsOverride : approvedFromSessions
  const claimedStr = journalHours.toFixed(1)
  const approvedStr = approvedHours.toFixed(1)
  if (approvedStr !== claimedStr) {
    push(`Reviewer overrode hours: claimed ${claimedStr}h → approved ${approvedStr}h`)
  }
  push()

  push(`Part of the time for this project was tracked via journaling. After making sure the project worked, and was shipped, the second pass reviewer decided the deflation.`)
  push()

  // Design-review context (only shown on a build approval, for cross-stage context)
  if (isBuild) {
    const designSummary = await resolveStageReview(projectId, "DESIGN")
    if (designSummary) {
      push(`--- Design Review (approved ${fmtDate(designSummary.date)} by ${designSummary.reviewerName}) ---`)
      if (designSummary.text) push(designSummary.text)
      push(`  Design hours: ${designHours.toFixed(1)}h across ${designSessions.length} entr${designSessions.length === 1 ? "y" : "ies"}`)
      push()
    }
  }

  // First-pass review for the current stage (prefer internal reason, fall back to feedback)
  const firstPass = await resolveFirstPassReview(projectId, stage)
  if (firstPass) {
    push(`--- First-pass review (${fmtDate(firstPass.date)} by ${firstPass.reviewerName}) ---`)
    if (firstPass.text) push(firstPass.text)
    push()
  }

  // Second-pass (finalizing) review — INTERNAL justification, never user-facing
  // feedback. A live decision passes the reviewer + justification directly; a
  // re-sync (no live reviewer) reconstructs it from the latest persisted review.
  const secondPass = input.reviewerName !== undefined
    ? { date: new Date(), reviewerName: input.reviewerName, text: input.justification ?? null }
    : (await resolveStageReview(projectId, stage)) ?? { date: new Date(), reviewerName: "Unknown", text: null }
  push(`--- Second-pass review (${fmtDate(secondPass.date)} by ${secondPass.reviewerName}) ---`)
  if (secondPass.text) push(secondPass.text)
  push()

  // BOM
  const approvedBom = project.bomItems.filter((b) => b.status === "approved" || b.status === "pending")
  const bomItemsCost = approvedBom.reduce((sum, b) => sum + b.totalCost, 0)
  const bomTax = project.bomTax ?? 0
  const bomShip = project.bomShipping ?? 0
  const bomTotal = bomItemsCost + bomTax + bomShip
  if (approvedBom.length > 0 || bomTax > 0 || bomShip > 0) {
    const costParts = [`$${bomItemsCost.toFixed(2)} parts`]
    if (bomTax > 0) costParts.push(`$${bomTax.toFixed(2)} tax`)
    if (bomShip > 0) costParts.push(`$${bomShip.toFixed(2)} shipping`)
    push(`BOM (${approvedBom.length} item${approvedBom.length === 1 ? "" : "s"}, ${costParts.join(" + ")} = $${bomTotal.toFixed(2)} total):`)
    for (const item of approvedBom) {
      const detail = item.quantity != null && item.quantity > 1
        ? `${item.quantity}x = $${item.totalCost.toFixed(2)}`
        : `$${item.totalCost.toFixed(2)}`
      push(`  - ${item.name}: ${detail}${item.status === "pending" ? " (pending)" : ""}`)
    }
    push()
  }

  if (project.badges.length > 0) {
    push(`Badges: ${project.badges.map((b) => b.badge).join(", ")}`)
    push()
  }

  if (project.hackatimeProjects.length > 0) {
    const names = project.hackatimeProjects.map((hp) =>
      hp.hoursApproved != null ? `${hp.hackatimeProject} (${hp.hoursApproved.toFixed(1)}h approved)` : hp.hackatimeProject
    )
    push(`Hackatime project${project.hackatimeProjects.length === 1 ? "" : "s"}: ${names.join(", ")}`)
    push()
  }

  if (project.githubRepo) push(`GitHub: ${project.githubRepo}`)
  if (project.description) push(`Description: ${project.description}`)
  push()

  // Journal link — deliberately NOT followed by a period so it stays clickable.
  push(`The full journal for this project can be found at ${baseUrl}/dashboard/discover/${projectId}`)

  // Collapse any accidental runs of blank lines and trim the edges.
  const out: string[] = []
  for (const line of lines) {
    if (line === "" && out[out.length - 1] === "") continue
    out.push(line)
  }
  while (out.length && out[0] === "") out.shift()
  while (out.length && out[out.length - 1] === "") out.pop()
  return out.join("\n")
}

/**
 * Resolve a short summary of the finalizing (second-pass) review for a stage.
 * Used both for the cross-stage design context on a build justification and to
 * reconstruct the second-pass section on a re-sync. This is the FINALIZING
 * decision — an admin SubmissionReview (internal `reason`) or, failing that,
 * the ProjectReviewAction's comments. The first-pass (non-admin) review is
 * deliberately excluded so it doesn't masquerade as the second pass.
 */
async function resolveStageReview(
  projectId: string,
  stage: JustificationStage,
): Promise<{ date: Date; reviewerName: string; text: string | null } | null> {
  const submission = await prisma.projectSubmission.findFirst({
    where: { projectId, stage },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
  if (submission) {
    const review = await prisma.submissionReview.findFirst({
      where: { submissionId: submission.id, isAdminReview: true, result: "APPROVED" },
      orderBy: { createdAt: "desc" },
      select: { reviewerId: true, reason: true, feedback: true, createdAt: true },
    })
    if (review) {
      const u = await prisma.user.findUnique({ where: { id: review.reviewerId }, select: { name: true, email: true } })
      return {
        date: review.createdAt,
        reviewerName: u?.name || u?.email || "Unknown",
        text: review.reason || review.feedback || null,
      }
    }
  }

  const action = await prisma.projectReviewAction.findFirst({
    where: { projectId, stage, decision: "APPROVED" },
    orderBy: { createdAt: "desc" },
    select: { reviewerId: true, comments: true, createdAt: true },
  })
  if (action) {
    const u = action.reviewerId
      ? await prisma.user.findUnique({ where: { id: action.reviewerId }, select: { name: true, email: true } })
      : null
    return {
      date: action.createdAt,
      reviewerName: u?.name || u?.email || "Unknown",
      text: action.comments || null,
    }
  }
  return null
}

/**
 * Resolve the first-pass (non-admin) review for the given stage. Prefers the
 * internal `reason`, falling back to user-facing feedback.
 */
async function resolveFirstPassReview(
  projectId: string,
  stage: JustificationStage,
): Promise<{ date: Date; reviewerName: string; text: string | null } | null> {
  const submission = await prisma.projectSubmission.findFirst({
    where: { projectId, stage },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
  if (!submission) return null

  const firstPass = await prisma.submissionReview.findFirst({
    where: { submissionId: submission.id, isAdminReview: false, result: "APPROVED" },
    orderBy: { createdAt: "desc" },
    select: { reviewerId: true, reason: true, feedback: true, createdAt: true },
  })
  if (!firstPass) return null

  const u = await prisma.user.findUnique({ where: { id: firstPass.reviewerId }, select: { name: true, email: true } })
  return {
    date: firstPass.createdAt,
    reviewerName: u?.name || u?.email || "Unknown",
    text: firstPass.reason || firstPass.feedback || null,
  }
}
