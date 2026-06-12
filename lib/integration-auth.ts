import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"

export function requireBearerAuth(
  request: NextRequest,
  envVar: string
): NextResponse | null {
  const expected = process.env[envVar]
  if (!expected) {
    return NextResponse.json(
      { error: "API not configured" },
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

export function requireIntegrationAuth(request: NextRequest): NextResponse | null {
  return requireBearerAuth(request, "INTEGRATION_API_KEY")
}

// Accepts a Bearer token matching ANY of the given env vars. Use to gate a
// route with a narrow per-partner key alongside the broad internal key, e.g.
// requireAnyBearerAuth(request, ["FALLOUT_API_KEY", "INTEGRATION_API_KEY"]).
export function requireAnyBearerAuth(
  request: NextRequest,
  envVars: string[]
): NextResponse | null {
  const expectedKeys = envVars
    .map((name) => process.env[name])
    .filter((v): v is string => Boolean(v))

  if (expectedKeys.length === 0) {
    return NextResponse.json({ error: "API not configured" }, { status: 503 })
  }

  const header = request.headers.get("authorization") ?? ""
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const provided = Buffer.from(match[1].trim())
  const ok = expectedKeys.some((key) => {
    const expected = Buffer.from(key)
    return provided.length === expected.length && timingSafeEqual(provided, expected)
  })

  return ok ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
