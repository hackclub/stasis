import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    const { startOverdueChecker } = await import("./lib/inventory/overdue-checker");
    startOverdueChecker();

    // Backfill Slack group DMs for teams that don't have one yet
    const { syncTeamChannel } = await import("./lib/inventory/team-channel");
    const prisma = (await import("./lib/prisma")).default;
    prisma.team.findMany({
      where: { slackChannelId: null },
      select: { id: true },
    }).then((teams) => {
      for (const team of teams) {
        syncTeamChannel(team.id).catch(() => {});
      }
    }).catch(() => {});
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
