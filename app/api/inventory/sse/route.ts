import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextRequest } from "next/server"
import { registerConnection, removeConnection } from "@/lib/inventory/sse"
import prisma from "@/lib/prisma"

const encoder = new TextEncoder()
const KEEPALIVE = encoder.encode(": keepalive\n\n")

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return new Response("Unauthorized", { status: 401 })
  }

  const teamId = request.nextUrl.searchParams.get("teamId") || "admin"

  // Verify the user belongs to the requested team or is an admin
  if (teamId === "admin") {
    const isAdmin = await prisma.userRole.findFirst({
      where: { userId: session.user.id, role: "ADMIN" },
    })
    if (!isAdmin) {
      return new Response("Forbidden", { status: 403 })
    }
  } else {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { teamId: true },
    })
    if (user?.teamId !== teamId) {
      const isAdmin = await prisma.userRole.findFirst({
        where: { userId: session.user.id, role: "ADMIN" },
      })
      if (!isAdmin) {
        return new Response("Forbidden", { status: 403 })
      }
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      const accepted = registerConnection(teamId, controller)
      if (!accepted) {
        controller.enqueue(encoder.encode("data: {\"type\":\"error\",\"data\":\"Too many connections\"}\n\n"))
        controller.close()
        return
      }

      controller.enqueue(KEEPALIVE)

      const interval = setInterval(() => {
        try {
          controller.enqueue(KEEPALIVE)
        } catch {
          clearInterval(interval)
        }
      }, 30_000)

      request.signal.addEventListener("abort", () => {
        clearInterval(interval)
        removeConnection(teamId, controller)
        try {
          controller.close()
        } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
