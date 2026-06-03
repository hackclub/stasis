import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export type PublicTimelineItem =
  | {
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
  | {
      type: "SUBMISSION";
      at: string;
      stage: "DESIGN" | "BUILD";
      notes: string | null;
      user: {
        name: string | null;
        image: string | null;
      };
    }
  | {
      type: "REVIEW_ACTION";
      at: string;
      stage: "DESIGN" | "BUILD";
      decision: "APPROVED" | "CHANGE_REQUESTED" | "REJECTED";
      comments: string | null;
      reviewerName: string | null;
      reviewerImage: string | null;
    };

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
      deletedAt: true,
      hiddenFromGallery: true,
      user: {
        select: {
          name: true,
          slackDisplayName: true,
          image: true,
        },
      },
    },
  });

  if (!project || project.deletedAt || project.hiddenFromGallery) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const [workSessions, submissions, reviewActions] = await Promise.all([
    prisma.workSession.findMany({
      where: { projectId: id },
      include: { media: true, timelapses: true },
    }),
    prisma.projectSubmission.findMany({
      where: { projectId: id },
    }),
    prisma.projectReviewAction.findMany({
      where: { projectId: id },
    }),
  ]);

  const reviewerIds = reviewActions
    .map((r) => r.reviewerId)
    .filter((id): id is string => id !== null);

  const reviewers =
    reviewerIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: reviewerIds } },
          select: { id: true, slackDisplayName: true, image: true },
        })
      : [];

  const reviewerMap = new Map(
    reviewers.map((r) => [
      r.id,
      { name: r.slackDisplayName || "Reviewer", image: null as string | null },
    ])
  );

  const displayName = project.user.slackDisplayName || project.user.name;
  const projectUser = { name: displayName, image: project.user.image };

  const timeline: PublicTimelineItem[] = [];

  for (const ws of workSessions) {
    timeline.push({
      type: "WORK_SESSION",
      at: ws.createdAt.toISOString(),
      user: projectUser,
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
    });
  }

  for (const sub of submissions) {
    timeline.push({
      type: "SUBMISSION",
      at: sub.createdAt.toISOString(),
      stage: sub.stage,
      notes: sub.notes,
      user: projectUser,
    });
  }

  for (const ra of reviewActions) {
    const reviewer = ra.reviewerId ? reviewerMap.get(ra.reviewerId) : null;
    timeline.push({
      type: "REVIEW_ACTION",
      at: ra.createdAt.toISOString(),
      stage: ra.stage,
      decision: ra.decision,
      comments: ra.comments,
      reviewerName: reviewer?.name ?? null,
      reviewerImage: reviewer?.image ?? null,
    });
  }

  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return NextResponse.json(timeline);
}
