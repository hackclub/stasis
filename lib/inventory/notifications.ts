import prisma from "@/lib/prisma"
import { sendSlackDM } from "@/lib/slack"

export function notifyTeam(teamId: string, message: string) {
  // Fire-and-forget: don't await, don't block the response
  prisma.user
    .findMany({
      where: { teamId },
      select: { slackId: true },
    })
    .then((members) => {
      for (const member of members) {
        if (member.slackId) {
          sendSlackDM(member.slackId, message).catch(() => {})
        }
      }
    })
    .catch(() => {})
}
