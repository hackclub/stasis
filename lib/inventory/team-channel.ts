import prisma from "@/lib/prisma"

async function slackApi(method: string, body: Record<string, unknown>) {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return null

  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.ok && data.error !== "already_pinned") {
    console.error(`[syncTeamChannel] ${method} failed:`, data.error)
    return null
  }
  return data
}

function buildWelcomeBlocks(teamName: string, memberNames: string[]) {
  const memberList = memberNames.length > 0
    ? memberNames.map((n) => `- ${n}`).join("\n")
    : "_No members yet_"

  return [
    {
      type: "header",
      text: { type: "plain_text", text: `Team: ${teamName}` },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "This is your team's Stasis Inventory channel. Order updates, rental notifications, and coordination all happen here.",
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Members (${memberNames.length})*\n${memberList}`,
      },
    },
  ]
}

/**
 * Create or update a Slack group DM for a team.
 * Posts a welcome message and updates it when membership changes.
 */
export async function syncTeamChannel(teamId: string) {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      name: true,
      slackChannelId: true,
      slackWelcomeTs: true,
      members: { select: { name: true, slackId: true } },
    },
  })

  if (!team) return

  const slackIds = team.members
    .map((m) => m.slackId)
    .filter((id): id is string => !!id && /^[UW]/.test(id))

  if (slackIds.length === 0) return

  const memberNames = team.members
    .map((m) => m.name)
    .filter(Boolean) as string[]

  try {
    const openData = await slackApi("conversations.open", {
      users: slackIds.join(","),
    })
    if (!openData) return

    const channelId = openData.channel.id
    const channelChanged = channelId !== team.slackChannelId

    const blocks = buildWelcomeBlocks(team.name, memberNames)
    const text = `Team: ${team.name} -- ${memberNames.length} members`

    if (team.slackWelcomeTs && !channelChanged) {
      // Update the existing welcome message
      await slackApi("chat.update", {
        channel: channelId,
        ts: team.slackWelcomeTs,
        text,
        blocks,
      })
    } else {
      // Post new welcome message
      const msgData = await slackApi("chat.postMessage", {
        channel: channelId,
        text,
        blocks,
      })

      if (msgData) {
        await prisma.team.update({
          where: { id: teamId },
          data: {
            slackChannelId: channelId,
            slackWelcomeTs: msgData.ts,
          },
        })
        return
      }
    }

    if (channelChanged) {
      await prisma.team.update({
        where: { id: teamId },
        data: { slackChannelId: channelId },
      })
    }
  } catch (err) {
    console.error("[syncTeamChannel] Error:", err)
  }
}
