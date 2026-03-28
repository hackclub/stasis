import prisma from "@/lib/prisma"
import { sendSlackMessage } from "@/lib/slack"

export function shortOrderId(id: string): string {
  return id.slice(-6).toUpperCase()
}

export function notifyTeam(
  teamId: string,
  message: string,
  blocks?: Record<string, unknown>[]
) {
  prisma.team
    .findUnique({
      where: { id: teamId },
      select: { slackChannelId: true },
    })
    .then((team) => {
      if (!team?.slackChannelId) return
      sendSlackMessage(
        team.slackChannelId,
        message,
        blocks ? { blocks } : undefined
      ).catch(() => {})
    })
    .catch(() => {})
}

interface OrderForNotification {
  id: string
  items: Array<{ item: { name: string }; quantity: number }>
  floor: number
  location: string
}

export function notifyOrderUpdate(
  teamId: string,
  order: OrderForNotification,
  action: string
) {
  const id = shortOrderId(order.id)
  const itemList = order.items
    .map((i) => `${i.item.name} x${i.quantity}`)
    .join("\n")
  const fallback = `${action} (Order #${id}): ${order.items.map((i) => `${i.item.name} x${i.quantity}`).join(", ")} -- Floor ${order.floor}, ${order.location}`

  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: action },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Order*\n#${id}` },
        { type: "mrkdwn", text: `*Location*\nFloor ${order.floor}, ${order.location}` },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Items*\n${itemList}` },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: "Stasis Inventory" },
      ],
    },
  ]

  notifyTeam(teamId, fallback, blocks)
}

export function notifyRental(
  teamId: string,
  toolName: string,
  title: string,
  detail?: string
) {
  const fallback = detail
    ? `${title}: ${toolName} -- ${detail}`
    : `${title}: ${toolName}`

  const fields: Record<string, unknown>[] = [
    { type: "mrkdwn", text: `*Tool*\n${toolName}` },
  ]
  if (detail) {
    fields.push({ type: "mrkdwn", text: `*Details*\n${detail}` })
  }

  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: title },
    },
    {
      type: "section",
      fields,
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: "Stasis Inventory" },
      ],
    },
  ]

  notifyTeam(teamId, fallback, blocks)
}
