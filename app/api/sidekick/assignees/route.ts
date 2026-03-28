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
      projects: a.assignee.projects.map((p) => ({
        id: p.id,
        title: p.title,
        designStatus: p.designStatus,
        buildStatus: p.buildStatus,
      })),
    };
  });

  if (format === "csv") {
    const header =
      "First Name,Last Name,Email,Pronouns,Slack Display Name,Slack ID,Join Date,Assigned Date,Journals,Hours,Projects";
    const rows = assignees.map((a) =>
      [
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
      ]
        .map((v) => {
          const escaped = v.replace(/"/g, '""');
          const safe = /^[=+\-@]/.test(escaped) ? `'${escaped}` : escaped;
          return `"${safe}"`;
        })
        .join(",")
    );
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
