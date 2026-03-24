import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextRequest } from "next/server"
import { registerConnection, removeConnection } from "@/lib/inventory/sse"

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return new Response("Unauthorized", { status: 401 })
  }

  const teamId = request.nextUrl.searchParams.get("teamId") || "admin"

  const stream = new ReadableStream({
    start(controller) {
      registerConnection(teamId, controller)

      // Send initial keepalive
      controller.enqueue(new TextEncoder().encode(": keepalive\n\n"))

      // Keepalive interval
      const interval = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": keepalive\n\n"))
        } catch {
          clearInterval(interval)
        }
      }, 30_000)

      // Clean up on abort
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
