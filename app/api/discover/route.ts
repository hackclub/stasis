import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const userId = session.user.id;
  
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limitParam = parseInt(searchParams.get("limit") || "", 10);
  const limit = Math.min(
    Number.isNaN(limitParam) ? DEFAULT_LIMIT : limitParam,
    MAX_LIMIT
  );

  const projects = await prisma.project.findMany({
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    where: {
      workSessions: {
        some: {},
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          slackDisplayName: true,
          image: true,
        },
      },
      workSessions: {
        take: 4,
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
          media: {
            where: { type: "IMAGE" },
            take: 1,
            select: { url: true },
          },
        },
      },
      _count: {
        select: {
          kudos: true,
          workSessions: true,
        },
      },
      kudos: {
        where: { userId },
        select: { id: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const result = projects.map((p) => {
    // Collect all images from work sessions (up to 4)
    const allImages: string[] = [];
    for (const ws of p.workSessions) {
      for (const m of ws.media) {
        if (allImages.length < 4) {
          allImages.push(m.url);
        }
      }
    }
    
    const { slackDisplayName, ...userRest } = p.user;
    const displayUser = {
      ...userRest,
      name: slackDisplayName || p.user.name,
    };

    return {
      id: p.id,
      title: p.title,
      description: p.description,
      coverImage: p.coverImage,
      images: allImages,
      tags: p.tags,
      user: displayUser,
      kudosCount: p._count.kudos,
      sessionCount: p._count.workSessions,
      lastActivity: p.workSessions[0]?.createdAt ?? p.updatedAt,
      hasGivenKudos: (p.kudos as { id: string }[]).length > 0,
    };
  });

  let nextCursor: string | null = null;
  if (result.length > limit) {
    const lastItem = result.pop();
    nextCursor = lastItem?.id ?? null;
  }

  return NextResponse.json({
    projects: result,
    nextCursor,
  });
}
