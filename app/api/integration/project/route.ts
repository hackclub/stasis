import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireBearerAuth } from "@/lib/integration-auth"

export async function GET(request: NextRequest) {
  const authError = requireBearerAuth(request, "PUBLIC_API_KEY")
  if (authError) return authError

  const githubUrl = request.nextUrl.searchParams.get("github_url")
  if (!githubUrl) {
    return NextResponse.json(
      { error: "Missing required query parameter: github_url" },
      { status: 400 }
    )
  }

  const project = await prisma.project.findFirst({
    where: {
      githubRepo: githubUrl,
      deletedAt: null,
    },
    select: {
      title: true,
      description: true,
      tags: true,
      tier: true,
      designStatus: true,
      buildStatus: true,
      coverImage: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          name: true,
          slackDisplayName: true,
          image: true,
        },
      },
      _count: {
        select: {
          workSessions: true,
        },
      },
    },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  return NextResponse.json({
    title: project.title,
    description: project.description,
    tags: project.tags,
    tier: project.tier,
    designStatus: project.designStatus,
    buildStatus: project.buildStatus,
    coverImage: project.coverImage,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    sessionCount: project._count.workSessions,
    user: {
      name: project.user.slackDisplayName || project.user.name,
      image: project.user.image,
    },
  })
}
