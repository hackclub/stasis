import { sendInviteConfirmationEmail } from "@/lib/loops"
import prisma from "@/lib/prisma"

export function splitName(fullName: string | null | undefined): {
  firstName: string
  lastName: string
} {
  const trimmed = (fullName ?? "").trim()
  if (!trimmed) return { firstName: "Hacker", lastName: "" }
  const parts = trimmed.split(/\s+/)
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  }
}

export type AttendRegisterResult =
  | { ok: true; alreadyRegistered: boolean }
  | { ok: false; status: number; body: string }
  | { ok: false; skipped: true }

const DUPLICATE_MARKERS = [
  "already exists",
  "already registered",
  "already a participant",
  "duplicate",
  "has already been taken",
]

function looksLikeDuplicate(status: number, body: string): boolean {
  if (status === 409) return true
  const lower = body.toLowerCase()
  return DUPLICATE_MARKERS.some((m) => lower.includes(m))
}

export async function registerAttendParticipant({
  firstName,
  lastName,
  email,
}: {
  firstName: string
  lastName: string
  email: string
}): Promise<AttendRegisterResult> {
  const apiKey = process.env.ATTEND_API_KEY
  if (!apiKey) {
    console.warn("ATTEND_API_KEY not configured, skipping Attend registration")
    return { ok: false, skipped: true }
  }

  const resp = await fetch(
    "https://attend.hackclub.com/api/v1/events/stasis/participants",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        email,
      }),
    }
  )

  if (resp.ok) return { ok: true, alreadyRegistered: false }

  const body = await resp.text().catch(() => "<no body>")

  if (looksLikeDuplicate(resp.status, body)) {
    return { ok: true, alreadyRegistered: true }
  }

  return { ok: false, status: resp.status, body }
}

/**
 * TODO: Attend's GET endpoint is currently down. When it returns, implement this
 * to fetch the participant list for periodic reconciliation.
 *
 * export async function listAttendParticipants(): Promise<Array<{ email: string }>>
 */

export type InvitePurchaseResult =
  | { ok: true; alreadyRegistered: boolean }
  | { ok: false; error: string; skipped?: boolean }

/**
 * Side effects after a Stasis Event Invite is granted or purchased.
 * Persists Attend registration outcome to User and upserts an
 * AttendanceCandidate row so the buyer shows up on the attendance dashboard.
 *
 * Loops email is best-effort. Attend registration failure is surfaced via
 * the return value so the caller can refund / abort. Candidate sync failures
 * are swallowed (the attend-sync cron will catch missing rows on next sweep).
 */
export async function runInvitePurchaseSideEffects({
  userId,
  email,
  name,
}: {
  userId: string
  email: string
  name: string | null
}): Promise<InvitePurchaseResult> {
  const { firstName, lastName } = splitName(name)

  const [, attendResult] = await Promise.all([
    sendInviteConfirmationEmail({ email, firstName }).catch((err) => {
      console.error("[invite-side-effects] Loops email failed:", err)
    }),
    registerAttendParticipant({ firstName, lastName, email }).catch(
      (err): AttendRegisterResult => ({
        ok: false,
        status: 0,
        body: err instanceof Error ? err.message : String(err),
      })
    ),
  ])

  if (!attendResult.ok) {
    if ("skipped" in attendResult) {
      return { ok: false, error: "ATTEND_API_KEY not configured", skipped: true }
    }
    const errMsg = `[${attendResult.status}] ${attendResult.body}`.slice(0, 500)
    console.error("[invite-side-effects] Attend registration failed:", errMsg)
    await prisma.user
      .update({
        where: { id: userId },
        data: { attendLastError: errMsg },
      })
      .catch((err) =>
        console.error(
          "[invite-side-effects] Failed to write attend error status:",
          err
        )
      )
    return { ok: false, error: errMsg }
  }

  await prisma.user
    .update({
      where: { id: userId },
      data: {
        attendRegisteredAt: new Date(),
        attendLastError: null,
      },
    })
    .catch((err) =>
      console.error(
        "[invite-side-effects] Failed to write attend success status:",
        err
      )
    )

  await syncCandidateForTicketPurchase(userId).catch((err) => {
    console.error("[invite-side-effects] Candidate sync failed:", err)
  })

  return { ok: true, alreadyRegistered: attendResult.alreadyRegistered }
}

const BUMP_TO_SOFT_YES = new Set(["IDENTIFIED", "CONTACTED"])
const FLAG_LOUDLY = new Set(["DECLINED", "SHELVED"])

async function syncCandidateForTicketPurchase(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, pronouns: true },
  })
  if (!user) return

  const existing = await prisma.attendanceCandidate.findUnique({
    where: { userId },
    select: {
      id: true,
      outreachStatus: true,
      notes: true,
      attendInvited: true,
      invitedAt: true,
    },
  })

  const today = new Date()
  const dateStr = `${today.getMonth() + 1}/${today.getDate()}`
  const ticketNote = `Bought a ticket ${dateStr}`
  const sourcingReason = `Auto-pooled: purchased Stasis Event Invite (${dateStr})`
  const isGirl =
    user.pronouns && /she\/her/i.test(user.pronouns) ? true : null

  if (!existing) {
    const created = await prisma.attendanceCandidate.create({
      data: {
        user: { connect: { id: userId } },
        outreachStatus: "SOFT_YES",
        source: "STASIS_USER",
        notes: ticketNote,
        sourcingReason,
        attendInvited: true,
        isGirl,
        invitedAt: today,
        attendCachedAt: today,
      },
      select: { id: true },
    })
    await prisma.attendanceAuditEntry.create({
      data: {
        candidateId: created.id,
        actorId: null,
        field: "outreachStatus",
        oldValue: null,
        newValue: "SOFT_YES (created on ticket purchase)",
      },
    })
    return
  }

  const isBumped = BUMP_TO_SOFT_YES.has(existing.outreachStatus)
  const isFlagged = FLAG_LOUDLY.has(existing.outreachStatus)

  const newStatus = isBumped ? "SOFT_YES" : existing.outreachStatus
  const appendedNote = isFlagged
    ? `🚨 ${ticketNote} (was ${existing.outreachStatus} — review)`
    : ticketNote
  const newNotes = existing.notes
    ? `${existing.notes}\n${appendedNote}`
    : appendedNote

  await prisma.attendanceCandidate.update({
    where: { id: existing.id },
    data: {
      outreachStatus: newStatus,
      notes: newNotes,
      attendInvited: true,
      invitedAt: existing.invitedAt ?? today,
    },
  })

  if (newStatus !== existing.outreachStatus) {
    await prisma.attendanceAuditEntry.create({
      data: {
        candidateId: existing.id,
        actorId: null,
        field: "outreachStatus",
        oldValue: existing.outreachStatus,
        newValue: `${newStatus} (ticket purchase)`,
      },
    })
  }
  if (!existing.attendInvited) {
    await prisma.attendanceAuditEntry.create({
      data: {
        candidateId: existing.id,
        actorId: null,
        field: "attendInvited",
        oldValue: "false",
        newValue: "true (ticket purchase)",
      },
    })
  }
  if (isFlagged) {
    await prisma.attendanceAuditEntry.create({
      data: {
        candidateId: existing.id,
        actorId: null,
        field: "notes",
        oldValue: null,
        newValue: `Ticket purchase while ${existing.outreachStatus}`,
      },
    })
  }
}
