import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Verify project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true, hiddenFromGallery: true },
  });

  if (!project || project.hiddenFromGallery) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Can't give kudos to your own project
  if (project.userId === userId) {
    return NextResponse.json(
      { error: "Cannot give kudos to your own project" },
      { status: 400 }
    );
  }

  // Check if already gave kudos
  const existing = await prisma.kudos.findUnique({
    where: {
      userId_projectId: { userId, projectId },
    },
  });

  if (existing) {
    return NextResponse.json({ error: "Already gave kudos" }, { status: 400 });
  }

  await prisma.kudos.create({
    data: {
      userId,
      projectId,
    },
  });

  const count = await prisma.kudos.count({ where: { projectId } });

  return NextResponse.json({ kudosCount: count, hasGivenKudos: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  await prisma.kudos.deleteMany({
    where: { userId, projectId },
  });

  const count = await prisma.kudos.count({ where: { projectId } });

  return NextResponse.json({ kudosCount: count, hasGivenKudos: false });
}
