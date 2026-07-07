import prisma from "@/lib/prisma"

// Event lifecycle flags. SUBMISSIONS_CLOSED is a server-side runtime env var
// (set in Coolify, takes effect on restart, no rebuild needed) so it must not
// be NEXT_PUBLIC_ - the client learns it via GET /api/event-status.
export function submissionsClosed(): boolean {
  return process.env.SUBMISSIONS_CLOSED === "true"
}

export const SUBMISSIONS_CLOSED_MESSAGE =
  "Stasis has ended and submissions are closed. Reviews of submitted work and the shop remain open."

export const UNSUBMIT_CLOSED_MESSAGE =
  "Stasis has ended and submissions are closed. Unsubmitting is disabled because you would not be able to resubmit."

export interface SubmissionAccess {
  closed: boolean
  // When open only because of an extension, the latest applicable expiry.
  extensionUntil: Date | null
}

// Per-user/per-project override of the SUBMISSIONS_CLOSED gate. A user-level
// extension (user.submissionExtensionUntil) covers everything the user does,
// including creating new projects; a project-level extension
// (project.submissionExtensionUntil) covers actions on that project only.
// Ownership is NOT checked here - callers enforce it as usual.
export async function getSubmissionAccess(
  userId: string,
  projectId?: string
): Promise<SubmissionAccess> {
  if (!submissionsClosed()) {
    return { closed: false, extensionUntil: null }
  }

  const now = new Date()
  const [user, project] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { submissionExtensionUntil: true },
    }),
    projectId
      ? prisma.project.findUnique({
          where: { id: projectId },
          select: { submissionExtensionUntil: true },
        })
      : Promise.resolve(null),
  ])

  const candidates = [
    user?.submissionExtensionUntil,
    project?.submissionExtensionUntil,
  ].filter((d): d is Date => d != null && d > now)

  if (candidates.length === 0) {
    return { closed: true, extensionUntil: null }
  }

  return {
    closed: false,
    extensionUntil: candidates.sort((a, b) => b.getTime() - a.getTime())[0],
  }
}
