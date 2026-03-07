import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminResult = await requireAdmin();
  if ("error" in adminResult && adminResult.error) return adminResult.error;
  const { session } = adminResult;

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, featuredAt: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Toggle: if already featured, unfeature; otherwise feature
  const isFeatured =
    project.featuredAt &&
    Date.now() - new Date(project.featuredAt).getTime() < 3 * 24 * 60 * 60 * 1000;

  if (isFeatured) {
    await prisma.project.update({
      where: { id },
      data: { featuredAt: null, featuredById: null },
    });
    return NextResponse.json({ featured: false });
  } else {
    await prisma.project.update({
      where: { id },
      data: { featuredAt: new Date(), featuredById: session!.user.id },
    });
    return NextResponse.json({ featured: true });
  }
}
