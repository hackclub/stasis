import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { runPreflightChecks } from "@/lib/github-checks"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const url = new URL(request.url)
  const pcb = url.searchParams.get('pcb') === 'true'
  const cad = url.searchParams.get('cad') === 'true'
  const firmware = url.searchParams.get('firmware') === 'true'

  const project = await prisma.project.findUnique({
    where: { id },
    select: { userId: true, githubRepo: true, deletedAt: true },
  })

  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const result = await runPreflightChecks(project.githubRepo, { pcb, cad, firmware })
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=30' },
    })
  } catch (err) {
    console.error('Preflight checks error:', err)
    const message = err instanceof TypeError && String(err).includes('fetch')
      ? 'Could not connect to GitHub - the proxy may be down'
      : 'Failed to run pre-submission checks'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
