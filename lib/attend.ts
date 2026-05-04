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

/**
 * Side effects after a Stasis Event Invite is granted or purchased.
 * Persists Attend registration outcome to User. Best-effort on Loops email.
 * Never throws — caller doesn't need to wrap.
 */
export async function runInvitePurchaseSideEffects({
  userId,
  email,
  name,
}: {
  userId: string
  email: string
  name: string | null
}): Promise<void> {
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

  if (attendResult.ok) {
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
  } else if ("skipped" in attendResult) {
    // ATTEND_API_KEY not configured — already warned, no DB write
  } else {
    const errMsg =
      `[${attendResult.status}] ${attendResult.body}`.slice(0, 500)
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
  }
}
