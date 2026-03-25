import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import prisma from "@/lib/prisma"

const GIRLS_CHANNEL_ID = "C0ANV6PL1AN"

export async function POST() {
  const authResult = await requirePermission(Permission.MANAGE_USERS)
  if ("error" in authResult && authResult.error) return authResult.error

  const token = process.env.SLACK_BOT_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: "SLACK_BOT_TOKEN not configured" },
      { status: 500 }
    )
  }

  // Find all users with she/her pronouns who have a Slack ID
  const users = await prisma.user.findMany({
    where: {
      pronouns: "she/her",
      slackId: { not: null },
    },
    select: { id: true, name: true, slackId: true },
  })

  const results: { slackId: string; name: string | null; ok: boolean; error?: string }[] = []

  for (const user of users) {
    if (!user.slackId) continue

    try {
      const res = await fetch("https://slack.com/api/conversations.invite", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: GIRLS_CHANNEL_ID,
          users: user.slackId,
        }),
      })
      const data = await res.json()

      if (data.ok || data.error === "already_in_channel") {
        results.push({
          slackId: user.slackId,
          name: user.name,
          ok: true,
          error: data.error === "already_in_channel" ? "already_in_channel" : undefined,
        })
      } else {
        results.push({
          slackId: user.slackId,
          name: user.name,
          ok: false,
          error: data.error,
        })
      }
    } catch (error) {
      results.push({
        slackId: user.slackId,
        name: user.name,
        ok: false,
        error: String(error),
      })
    }
  }

  const invited = results.filter((r) => r.ok && !r.error).length
  const alreadyIn = results.filter((r) => r.error === "already_in_channel").length
  const failed = results.filter((r) => !r.ok).length

  return NextResponse.json({
    total: users.length,
    invited,
    alreadyIn,
    failed,
    results,
  })
}
