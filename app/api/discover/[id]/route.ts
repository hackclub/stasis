import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getUserRoles, hasRole, Role } from "@/lib/permissions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id ?? null;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          slackDisplayName: true,
          image: true,
        },
      },
      badges: {
        select: {
          badge: true,
          grantedAt: true,
        },
      },
      _count: {
        select: {
          kudos: true,
          workSessions: true,
        },
      },
      ...(userId
        ? {
            kudos: {
              where: { userId },
              select: { id: true },
            },
          }
        : {}),
    },
  });

  const roles = userId ? await getUserRoles(userId) : [];
  const isAdmin = hasRole(roles, Role.ADMIN);

  if (!project || project.deletedAt || (project.hiddenFromGallery && !isAdmin)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { slackDisplayName, ...userRest } = project.user;
  const displayUser = {
    ...userRest,
    name: slackDisplayName || project.user.name,
  };

  return NextResponse.json({
    id: project.id,
    title: project.title,
    description: project.description,
    coverImage: project.coverImage,
    tags: project.tags,
    githubRepo: project.githubRepo,
    designStatus: project.designStatus,
    buildStatus: project.buildStatus,
    hiddenFromGallery: project.hiddenFromGallery,
    createdAt: project.createdAt,
    user: displayUser,
    badges: project.badges,
    kudosCount: project._count.kudos,
    sessionCount: project._count.workSessions,
    hasGivenKudos: userId ? (project.kudos as { id: string }[]).length > 0 : false,
    isOwner: userId ? userId === project.userId : false,
    isAdmin,
  });
}
