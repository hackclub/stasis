import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"

export function requireIntegrationAuth(request: NextRequest): NextResponse | null {
  const expected = process.env.INTEGRATION_API_KEY
  if (!expected) {
    return NextResponse.json(
      { error: "Integration API not configured" },
      { status: 503 }
    )
  }

  const header = request.headers.get("authorization") ?? ""
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const provided = match[1].trim()
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null
}
