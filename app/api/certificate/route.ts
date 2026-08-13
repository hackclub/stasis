import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getCertificateBits } from "@/lib/currency"
import { isCertificateQualified, CERTIFICATE_BITS_THRESHOLD } from "@/lib/tiers"

/**
 * GET /api/certificate
 *
 * Certificate qualification for the authenticated user.
 *
 *   certificateBits = net bits from projects whose build was approved
 *   builtProjects   = count of those projects
 *   qualified       = certificateBits >= CERTIFICATE_BITS_THRESHOLD
 *
 * Do NOT gate the certificate on /api/currency's `bitsEarned`. That number is
 * a wallet figure and counts admin bookkeeping (an event grant later reversed
 * by an ADMIN_DEDUCTION still reads as earned), so it marks builders with zero
 * approved builds as qualified. See getCertificateBits in lib/currency.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  const [certificateBits, builtProjects] = await Promise.all([
    getCertificateBits(prisma, userId),
    prisma.project.count({
      where: { userId, buildStatus: "approved", deletedAt: null },
    }),
  ])

  return NextResponse.json({
    certificateBits,
    builtProjects,
    threshold: CERTIFICATE_BITS_THRESHOLD,
    qualified: isCertificateQualified(certificateBits),
  })
}
