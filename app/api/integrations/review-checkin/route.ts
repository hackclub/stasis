import { NextRequest, NextResponse } from "next/server"
import { requireIntegrationAuth } from "@/lib/integration-auth"
import { runReviewCheckin } from "@/lib/review-checkin"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Bearer-authenticated daily review check-in for the Coolify scheduler. Posts a
// per-reviewer count (since the last check-in) + current queue size to
// #stasis-core. Pass ?dryRun=true to compute and return the numbers WITHOUT
// sending to Slack or advancing the checkpoint.
export async function POST(request: NextRequest) {
  const authError = requireIntegrationAuth(request)
  if (authError) return authError

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "true"
  const result = await runReviewCheckin({ dryRun })

  return NextResponse.json(result)
}
