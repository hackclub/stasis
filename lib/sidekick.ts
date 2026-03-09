import prisma from "@/lib/prisma";
import { Role } from "@/app/generated/prisma/client";
import { sendSlackDM } from "@/lib/slack";

export async function findLeastLoadedSidekick(excludeId?: string, pronouns?: string) {
  // For she/her users: prefer she/her sidekicks
  // For everyone else: use any sidekick but deprioritize she/her ones
  const preferSheHer = pronouns === "she/her";

  const allSidekickRoles = await prisma.userRole.findMany({
    where: {
      role: Role.SIDEKICK,
      ...(excludeId ? { userId: { not: excludeId } } : {}),
    },
    select: { userId: true, user: { select: { pronouns: true } } },
  });

  if (allSidekickRoles.length === 0) return null;

  // Split into she/her and non-she/her pools
  const sheHerIds = allSidekickRoles
    .filter((r) => r.user.pronouns === "she/her")
    .map((r) => r.userId);
  const otherIds = allSidekickRoles
    .filter((r) => r.user.pronouns !== "she/her")
    .map((r) => r.userId);

  // Determine which pool to search: she/her users get she/her pool first,
  // everyone else gets non-she/her pool first
  let primaryIds = preferSheHer ? sheHerIds : otherIds;
  let fallbackIds = preferSheHer ? otherIds : sheHerIds;

  // If primary pool is empty, use fallback
  if (primaryIds.length === 0) {
    primaryIds = fallbackIds;
    fallbackIds = [];
  }

  const allIds = [...primaryIds, ...fallbackIds];
  const counts = await prisma.sidekickAssignment.groupBy({
    by: ["sidekickId"],
    where: { sidekickId: { in: allIds } },
    _count: { id: true },
  });

  const countMap = new Map(counts.map((c) => [c.sidekickId, c._count.id]));

  // Pick the least-loaded from the primary pool
  let minId = primaryIds[0];
  let minCount = countMap.get(primaryIds[0]) ?? 0;
  for (const id of primaryIds) {
    const count = countMap.get(id) ?? 0;
    if (count < minCount) {
      minCount = count;
      minId = id;
    }
  }

  return minId;
}

export async function assignSidekick(assigneeId: string, pronouns?: string) {
  const sidekickId = await findLeastLoadedSidekick(undefined, pronouns);
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

  const dmPromises: Promise<unknown>[] = [];

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
        `Thanks for signing up for Stasis! Your Stasis Sidekick is ${assignment.sidekick.slackId ? `<@${assignment.sidekick.slackId}>` : sidekickName}. They're your go-to person if you need any help with building and shipping your hardware projects. Whenever you need help, just send them a message. Go DM them and say hi!`
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

  const dmPromises: Promise<unknown>[] = [];

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
        `Your sidekick has been updated to ${assignment.sidekick.slackId ? `<@${assignment.sidekick.slackId}>` : sidekickName}, they will now be helping you with all things Stasis!`
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

  // Reassign sequentially so each person is independently sorted
  // to the current least-loaded sidekick (counts update between each)
  const results = [];
  for (const { assigneeId } of assignments) {
    results.push(await reassignSidekick(assigneeId, undefined, sidekickId));
  }

  return results;
}
