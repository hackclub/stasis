import { NextRequest, NextResponse } from "next/server"
import { findCertificate, normalizeCode } from "@/lib/certificates"

/**
 * GET /api/certificate/verify?id=CODE
 *
 * Public, unauthenticated: anyone holding a certificate (a college, an
 * employer, a parent) must be able to check it without a Stasis account.
 * Returns only what a verifier needs — whether the code was issued and to
 * whom — never the recipient's email or PDF.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("id") ?? ""
  const code = normalizeCode(raw)

  if (!code) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  try {
    const certificate = await findCertificate(code)
    if (!certificate) {
      return NextResponse.json({ valid: false, code })
    }
    return NextResponse.json({
      valid: true,
      code: certificate.code,
      name: certificate.name,
      issuedAt: certificate.issuedAt,
    })
  } catch {
    return NextResponse.json(
      { error: "Verification is temporarily unavailable" },
      { status: 503 },
    )
  }
}
