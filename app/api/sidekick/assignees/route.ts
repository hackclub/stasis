import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/admin-auth";
import { Role } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireRole(Role.SIDEKICK);
  if ("error" in auth && auth.error) return auth.error;

  const { session } = auth;
  const format = request.nextUrl.searchParams.get("format");

  const assignments = await prisma.sidekickAssignment.findMany({
    where: { sidekickId: session!.user.id },
    include: {
      assignee: {
        select: {
          id: true,
          name: true,
          email: true,
          pronouns: true,
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

  const allAssignees = assignments.map((a) => {
    const allSessions = a.assignee.projects.flatMap((p) => p.workSessions);
    const lastSession = allSessions.reduce<Date | null>((latest, s) => {
      const d = new Date(s.createdAt);
      return !latest || d > latest ? d : latest;
    }, null);
    const fullName = a.assignee.slackDisplayName || a.assignee.name || "";
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ");
    return {
      id: a.assignee.id,
      name: fullName,
      firstName,
      lastName,
      email: a.assignee.email,
      pronouns: a.assignee.pronouns,
      image: a.assignee.image,
      slackDisplayName: a.assignee.slackDisplayName,
      slackId: a.assignee.slackId,
      createdAt: a.assignee.createdAt,
      assignedAt: a.assignedAt,
      journalCount: allSessions.length,
      totalHours: allSessions.reduce((sum, s) => sum + (s.hoursApproved ?? 0), 0),
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

  // Apply filters
  const activityFilter = request.nextUrl.searchParams.get("activity");
  const projectsFilter = request.nextUrl.searchParams.get("projects");
  const now = Date.now();

  const assignees = allAssignees.filter((a) => {
    if (activityFilter && activityFilter !== "all") {
      const days = a.lastActiveAt
        ? Math.floor((now - new Date(a.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      switch (activityFilter) {
        case "active":
          if (days === null || days > 7) return false;
          break;
        case "inactive_7":
          if (days !== null && days <= 7) return false;
          break;
        case "inactive_14":
          if (days !== null && days <= 14) return false;
          break;
        case "never":
          if (days !== null) return false;
          break;
      }
    }
    if (projectsFilter === "has_projects" && a.projectCount === 0) return false;
    if (projectsFilter === "no_projects" && a.projectCount > 0) return false;
    return true;
  });

  if (format === "csv") {
    const header =
      "First Name,Last Name,Email,Pronouns,Slack Display Name,Slack ID,Join Date,Assigned Date,Journals,Hours,Projects,Last Active,Days Inactive";
    const rows = assignees.map((a) => {
      const daysInactive = a.lastActiveAt
        ? Math.floor((now - new Date(a.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      return [
        a.firstName,
        a.lastName,
        a.email,
        a.pronouns || "",
        a.slackDisplayName || "",
        a.slackId || "",
        new Date(a.createdAt).toISOString().split("T")[0],
        new Date(a.assignedAt).toISOString().split("T")[0],
        String(a.journalCount),
        a.totalHours.toFixed(1),
        String(a.projectCount),
        a.lastActiveAt ? new Date(a.lastActiveAt).toISOString().split("T")[0] : "Never",
        daysInactive !== null ? String(daysInactive) : "N/A",
      ]
        .map((v) => {
          const escaped = v.replace(/"/g, '""');
          const safe = /^[=+\-@]/.test(escaped) ? `'${escaped}` : escaped;
          return `"${safe}"`;
        })
        .join(",");
    });
    const csv = [header, ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="sidekick-assignees-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  }

  return NextResponse.json(assignees);
}
