import prisma from "@/lib/prisma";
import { Role } from "@/app/generated/prisma/client";
import { sendSlackDM } from "@/lib/slack";

export async function findLeastLoadedSidekick(excludeId?: string, pronouns?: string) {
  const allSidekickRoles = await prisma.userRole.findMany({
    where: {
      role: Role.SIDEKICK,
      ...(excludeId ? { userId: { not: excludeId } } : {}),
    },
    select: { userId: true, user: { select: { pronouns: true } } },
  });

  if (allSidekickRoles.length === 0) return null;

  const allIds = allSidekickRoles.map((r) => r.userId);

  // she/her users → she/her sidekicks only (fallback to all if none exist)
  // everyone else → full pool, least-loaded
  let pool = allIds;
  if (pronouns === "she/her") {
    const sheHerIds = allSidekickRoles
      .filter((r) => r.user.pronouns === "she/her")
      .map((r) => r.userId);
    if (sheHerIds.length > 0) pool = sheHerIds;
  }

  const counts = await prisma.sidekickAssignment.groupBy({
    by: ["sidekickId"],
    where: { sidekickId: { in: pool } },
    _count: { id: true },
  });

  const countMap = new Map(counts.map((c) => [c.sidekickId, c._count.id]));

  // Pick the least-loaded from the pool
  let minId = pool[0];
  let minCount = countMap.get(pool[0]) ?? 0;
  for (const id of pool) {
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
  const [existing, assignee] = await Promise.all([
    prisma.sidekickAssignment.findUnique({ where: { assigneeId } }),
    prisma.user.findUnique({ where: { id: assigneeId }, select: { pronouns: true } }),
  ]);

  const targetSidekickId =
    newSidekickId ?? (await findLeastLoadedSidekick(excludeSidekickId ?? existing?.sidekickId, assignee?.pronouns ?? undefined));

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

export async function assignAllUnassigned() {
  const unassigned = await prisma.user.findMany({
    where: {
      assignedSidekick: null,
      roles: { none: { role: Role.SIDEKICK } },
    },
    select: { id: true, pronouns: true },
  });

  const results = [];
  for (const user of unassigned) {
    results.push(await assignSidekick(user.id, user.pronouns ?? undefined));
  }

  return results;
}
