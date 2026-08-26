import { NextRequest, NextResponse } from "next/server"
import { findCertificate, normalizeCode } from "@/lib/certificates"

/**
 * GET /api/certificate/download?id=CODE
 *
 * Streams the issued certificate PDF for a verified code.
 *
 * The bytes are proxied rather than redirecting to the stored file: Airtable
 * signs attachment URLs and expires them within hours, so a URL handed to the
 * browser would rot while the page sat open, and it would leak the base's
 * storage host. Proxying also lets the download carry the recipient's name as
 * the filename instead of an opaque attachment id.
 *
 * Public by design: the ID is printed on the certificate itself, so anyone
 * holding one can fetch their copy without an account. The response exposes
 * only the certificate, never the row's email.
 */
export async function GET(request: NextRequest) {
  const code = normalizeCode(request.nextUrl.searchParams.get("id") ?? "")
  if (!code) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  let certificate
  try {
    certificate = await findCertificate(code)
  } catch {
    return NextResponse.json({ error: "Download is temporarily unavailable" }, { status: 503 })
  }

  if (!certificate) {
    return NextResponse.json({ error: "No certificate found" }, { status: 404 })
  }
  if (!certificate.pdfUrl) {
    return NextResponse.json({ error: "No file on this certificate" }, { status: 404 })
  }

  const upstream = await fetch(certificate.pdfUrl)
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Download is temporarily unavailable" }, { status: 503 })
  }

  // Latin-1 for the plain filename, UTF-8 for names with diacritics.
  const filename = `Stasis Certificate - ${certificate.name}.pdf`
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "")

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition":
        `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, max-age=300",
    },
  })
}
