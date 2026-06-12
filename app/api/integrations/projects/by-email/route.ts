import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAnyBearerAuth } from "@/lib/integration-auth"

// Lookup-by-email export for sister programs (e.g. Fallout) ingesting a
// shipper's Stasis projects. Returns each non-deleted project with its
// journal entries (work sessions that carry a written log) as markdown +
// ISO 8601 timestamps. Auth: Bearer FALLOUT_API_KEY (narrow, this route only)
// or INTEGRATION_API_KEY (broad internal key).
export async function GET(request: NextRequest) {
  const authError = requireAnyBearerAuth(request, [
    "FALLOUT_API_KEY",
    "INTEGRATION_API_KEY",
  ])
  if (authError) return authError

  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase()
  if (!email) {
    return NextResponse.json(
      { error: "Missing required query parameter: email" },
      { status: 400 }
    )
  }

  const includeDeleted =
    request.nextUrl.searchParams.get("includeDeleted") === "true"

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      projects: {
        where: includeDeleted ? {} : { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          githubRepo: true,
          createdAt: true,
          updatedAt: true,
          // Journal entries: work sessions with a written log. The empty-content
          // filter mirrors how the app defines a "journal entry" elsewhere.
          workSessions: {
            where: { content: { not: null } },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              title: true,
              content: true,
              createdAt: true,
            },
          },
        },
      },
    },
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const projects = user.projects.map((p) => ({
    id: p.id,
    name: p.title,
    description: p.description,
    repoUrl: p.githubRepo,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    journalEntries: p.workSessions
      .filter((ws) => ws.content && ws.content.trim() !== "")
      .map((ws) => ({
        id: ws.id,
        title: ws.title,
        content: ws.content,
        createdAt: ws.createdAt,
      })),
  }))

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
    projects,
  })
}
