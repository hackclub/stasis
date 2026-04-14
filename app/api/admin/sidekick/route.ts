import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { Role } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const sidekickRoles = await prisma.userRole.findMany({
    where: { role: Role.SIDEKICK },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          slackId: true,
        },
      },
    },
  });

  const sidekicks = await Promise.all(
    sidekickRoles.map(async (sr) => {
      const assignments = await prisma.sidekickAssignment.findMany({
        where: { sidekickId: sr.userId },
        include: {
          assignee: {
            select: {
              id: true,
              name: true,
              image: true,
              slackId: true,
              createdAt: true,
              projects: {
                select: {
                  id: true,
                  title: true,
                  designStatus: true,
                  buildStatus: true,
                  workSessions: {
                    select: {
                      id: true,
                      hoursApproved: true,
                      createdAt: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { assignedAt: "desc" },
      });

      const assignees = assignments.map((a) => {
        const allSessions = a.assignee.projects.flatMap((p) => p.workSessions);
        const lastSession = allSessions.reduce<Date | null>((latest, s) => {
          const d = new Date(s.createdAt);
          return !latest || d > latest ? d : latest;
        }, null);
        return {
          id: a.assignee.id,
          name: a.assignee.name,
          image: a.assignee.image,
          slackId: a.assignee.slackId,
          createdAt: a.assignee.createdAt,
          assignedAt: a.assignedAt,
          journalCount: allSessions.length,
          totalHours: allSessions.reduce(
            (sum, s) => sum + (s.hoursApproved ?? 0),
            0
          ),
          projectCount: a.assignee.projects.length,
          lastActiveAt: lastSession?.toISOString() ?? null,
          projects: a.assignee.projects.map((p) => ({
            id: p.id,
            title: p.title,
            designStatus: p.designStatus,
            buildStatus: p.buildStatus,
          })),
        };
      });

      return {
        id: sr.user.id,
        name: sr.user.name,
        image: sr.user.image,
        slackId: sr.user.slackId,
        assigneeCount: assignees.length,
        assignees,
      };
    })
  );

  const unassignedUsers = await prisma.user.findMany({
    where: {
      assignedSidekick: null,
      roles: { none: { role: Role.SIDEKICK } },
    },
    select: {
      id: true,
      name: true,
      image: true,
      slackId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ sidekicks, unassignedUsers });
}
