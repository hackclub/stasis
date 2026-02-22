import { NextResponse } from "next/server";
import { requireRole } from "@/lib/admin-auth";
import { Role } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";

export async function GET() {
  const auth = await requireRole(Role.SIDEKICK);
  if ("error" in auth && auth.error) return auth.error;

  const { session } = auth;

  const assignments = await prisma.sidekickAssignment.findMany({
    where: { sidekickId: session!.user.id },
    include: {
      assignee: {
        select: {
          id: true,
          name: true,
          slackDisplayName: true,
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
    return {
      id: a.assignee.id,
      name: a.assignee.slackDisplayName || a.assignee.name,
      image: a.assignee.image,
      slackId: a.assignee.slackId,
      createdAt: a.assignee.createdAt,
      assignedAt: a.assignedAt,
      journalCount: allSessions.length,
      totalHours: allSessions.reduce((sum, s) => sum + (s.hoursApproved ?? 0), 0),
      projectCount: a.assignee.projects.length,
      projects: a.assignee.projects.map((p) => ({
        id: p.id,
        title: p.title,
        designStatus: p.designStatus,
        buildStatus: p.buildStatus,
      })),
    };
  });

  return NextResponse.json(assignees);
}
