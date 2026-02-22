import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export interface PublicTimelineItem {
  type: "WORK_SESSION";
  at: string;
  user: {
    name: string | null;
    image: string | null;
  };
  session: {
    id: string;
    hoursClaimed: number;
    hoursApproved: number | null;
    content: string | null;
    stage: "DESIGN" | "BUILD";
    media: {
      id: string;
      type: "IMAGE" | "VIDEO";
      url: string;
    }[];
    timelapses: {
      timelapseId: string;
      name: string | null;
      thumbnailUrl: string | null;
    }[];
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      userId: true,
      user: {
        select: {
          name: true,
          slackDisplayName: true,
          image: true,
        },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Fetch only work sessions for public timeline
  const workSessions = await prisma.workSession.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    include: {
      media: true,
      timelapses: true,
    },
  });

  const displayName = project.user.slackDisplayName || project.user.name;

  const timeline: PublicTimelineItem[] = workSessions.map((ws) => ({
    type: "WORK_SESSION",
    at: ws.createdAt.toISOString(),
    user: {
      name: displayName,
      image: project.user.image,
    },
    session: {
      id: ws.id,
      hoursClaimed: ws.hoursClaimed,
      hoursApproved: ws.hoursApproved,
      content: ws.content,
      stage: ws.stage,
      media: ws.media.map((m) => ({
        id: m.id,
        type: m.type,
        url: m.url,
      })),
      timelapses: ws.timelapses.map((t) => ({
        timelapseId: t.timelapseId,
        name: t.name,
        thumbnailUrl: t.thumbnailUrl,
      })),
    },
  }));

  return NextResponse.json(timeline);
}
