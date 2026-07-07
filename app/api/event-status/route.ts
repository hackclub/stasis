import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { submissionsClosed, getSubmissionAccess } from "@/lib/event"

export const dynamic = "force-dynamic"

// Reports the SUBMISSIONS_CLOSED gate as it applies to the caller. Pass
// ?projectId= to also honor that project's extension. Unauthenticated
// callers just get the global flag.
export async function GET(request: NextRequest) {
  if (!submissionsClosed()) {
    return NextResponse.json({ submissionsClosed: false, extensionUntil: null })
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ submissionsClosed: true, extensionUntil: null })
  }

  const projectId = request.nextUrl.searchParams.get("projectId") ?? undefined
  const access = await getSubmissionAccess(session.user.id, projectId)

  return NextResponse.json({
    submissionsClosed: access.closed,
    extensionUntil: access.extensionUntil?.toISOString() ?? null,
  })
}
