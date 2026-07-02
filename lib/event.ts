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
