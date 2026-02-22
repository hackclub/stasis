import prisma from "@/lib/prisma";
import { Role } from "@/app/generated/prisma/client";
import { sendSlackDM } from "@/lib/slack";

export async function findLeastLoadedSidekick(excludeId?: string) {
  const sidekickRoles = await prisma.userRole.findMany({
    where: {
      role: Role.SIDEKICK,
      ...(excludeId ? { userId: { not: excludeId } } : {}),
    },
    select: { userId: true },
  });

  if (sidekickRoles.length === 0) return null;

  const sidekickIds = sidekickRoles.map((r) => r.userId);

  const counts = await prisma.sidekickAssignment.groupBy({
    by: ["sidekickId"],
    where: { sidekickId: { in: sidekickIds } },
    _count: { id: true },
  });

  const countMap = new Map(counts.map((c) => [c.sidekickId, c._count.id]));

  let minId = sidekickIds[0];
  let minCount = countMap.get(sidekickIds[0]) ?? 0;
  for (const id of sidekickIds) {
    const count = countMap.get(id) ?? 0;
    if (count < minCount) {
      minCount = count;
      minId = id;
    }
  }

  return minId;
}

export async function assignSidekick(assigneeId: string) {
  const sidekickId = await findLeastLoadedSidekick();
  if (!sidekickId) {
    console.warn("No sidekicks available to assign");
    return null;
  }

  const assignment = await prisma.sidekickAssignment.create({
    data: { sidekickId, assigneeId },
    include: {
      sidekick: { select: { name: true, slackId: true } },
      assignee: { select: { name: true, slackId: true } },
    },
  });

  const sidekickName = assignment.sidekick.name ?? "Your sidekick";
  const assigneeName = assignment.assignee.name ?? "a new user";

  const dmPromises: Promise<void>[] = [];

  if (assignment.sidekick.slackId) {
    dmPromises.push(
      sendSlackDM(
        assignment.sidekick.slackId,
        `You've been assigned as a sidekick to ${assignment.assignee.slackId ? `<@${assignment.assignee.slackId}>` : assigneeName}! Help them get started on Stasis.`
      ).catch((err) => console.error("Failed to DM sidekick:", err))
    );
  }

  if (assignment.assignee.slackId) {
    dmPromises.push(
      sendSlackDM(
        assignment.assignee.slackId,
        `Thanks for signing up for Stasis! Your Stasis Sidekick is ${assignment.sidekick.slackId ? `<@${assignment.sidekick.slackId}>` : sidekickName}. They're your go-to person if you need any help with building and shipping your hardware projects. Go DM them and say hi!`
      ).catch((err) => console.error("Failed to DM assignee:", err))
    );
  }

  await Promise.all(dmPromises);

  return assignment;
}

export async function reassignSidekick(assigneeId: string, newSidekickId?: string, excludeSidekickId?: string) {
  const existing = await prisma.sidekickAssignment.findUnique({
    where: { assigneeId },
  });

  const targetSidekickId =
    newSidekickId ?? (await findLeastLoadedSidekick(excludeSidekickId ?? existing?.sidekickId));

  if (!targetSidekickId) {
    console.warn("No sidekicks available for reassignment");
    return null;
  }

  const assignment = await prisma.sidekickAssignment.upsert({
    where: { assigneeId },
    update: { sidekickId: targetSidekickId, assignedAt: new Date() },
    create: { sidekickId: targetSidekickId, assigneeId },
    include: {
      sidekick: { select: { name: true, slackId: true } },
      assignee: { select: { name: true, slackId: true } },
    },
  });

  const sidekickName = assignment.sidekick.name ?? "Your new sidekick";
  const assigneeName = assignment.assignee.name ?? "a user";

  const dmPromises: Promise<void>[] = [];

  if (assignment.sidekick.slackId) {
    dmPromises.push(
      sendSlackDM(
        assignment.sidekick.slackId,
        `You've been assigned as a sidekick to ${assignment.assignee.slackId ? `<@${assignment.assignee.slackId}>` : assigneeName}! Help them get started on Stasis.`
      ).catch((err) => console.error("Failed to DM new sidekick:", err))
    );
  }

  if (assignment.assignee.slackId) {
    dmPromises.push(
      sendSlackDM(
        assignment.assignee.slackId,
        `Your sidekick has been updated! ${assignment.sidekick.slackId ? `<@${assignment.sidekick.slackId}>` : sidekickName} will now help you on Stasis.`
      ).catch((err) => console.error("Failed to DM assignee:", err))
    );
  }

  await Promise.all(dmPromises);

  return assignment;
}

export async function reassignAllFromSidekick(sidekickId: string) {
  const assignments = await prisma.sidekickAssignment.findMany({
    where: { sidekickId },
    select: { assigneeId: true },
  });

  const results = await Promise.all(
    assignments.map(({ assigneeId }) =>
      reassignSidekick(assigneeId, undefined, sidekickId)
    )
  );

  return results;
}
