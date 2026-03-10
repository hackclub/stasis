import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { encryptPII } from "@/lib/pii"

const DISCOVERY_URL = "https://auth.hackclub.com/.well-known/openid-configuration"

let cachedUserinfoEndpoint: string | null = null

async function getUserinfoEndpoint(): Promise<string> {
  if (cachedUserinfoEndpoint) return cachedUserinfoEndpoint
  const resp = await fetch(DISCOVERY_URL)
  if (!resp.ok) throw new Error(`Failed to fetch OIDC discovery: ${resp.status}`)
  const config = await resp.json()
  cachedUserinfoEndpoint = config.userinfo_endpoint
  return cachedUserinfoEndpoint!
}

export async function POST() {
  if (process.env.PULL_HCA_PII !== "true") {
    return NextResponse.json({ hasAddress: true, piiEnabled: false, verificationStatus: null })
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  // Check if user already has address data
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { encryptedAddressStreet: true, verificationStatus: true },
  })

  const needsVerificationRefresh = user?.verificationStatus !== "verified"

  if (user?.encryptedAddressStreet && !needsVerificationRefresh) {
    return NextResponse.json({ hasAddress: true, piiEnabled: true, verificationStatus: user.verificationStatus })
  }

  // Try to refresh from HCA
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "hca" },
    select: { id: true, accessToken: true, refreshToken: true },
  })

  if (!account?.accessToken) {
    return NextResponse.json({ hasAddress: !!user?.encryptedAddressStreet, piiEnabled: true, verificationStatus: user?.verificationStatus ?? null })
  }

  try {
    const userinfoEndpoint = await getUserinfoEndpoint()
    let resp = await fetch(userinfoEndpoint, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    })

    // If access token expired, try refreshing
    if (!resp.ok && account.refreshToken) {
      const discoveryResp = await fetch(DISCOVERY_URL)
      if (!discoveryResp.ok) {
        return NextResponse.json({ hasAddress: !!user?.encryptedAddressStreet, piiEnabled: true, verificationStatus: user?.verificationStatus ?? null })
      }
      const config = await discoveryResp.json()

      const tokenResp = await fetch(config.token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: account.refreshToken,
          client_id: process.env.HCA_CLIENT_ID!,
          client_secret: process.env.HCA_CLIENT_SECRET!,
        }),
      })

      if (!tokenResp.ok) {
        return NextResponse.json({ hasAddress: !!user?.encryptedAddressStreet, piiEnabled: true, verificationStatus: user?.verificationStatus ?? null })
      }

      const tokenData = await tokenResp.json()

      await prisma.account.update({
        where: { id: account.id },
        data: {
          accessToken: tokenData.access_token,
          ...(tokenData.refresh_token ? { refreshToken: tokenData.refresh_token } : {}),
          ...(tokenData.expires_in
            ? { accessTokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000) }
            : {}),
        },
      })

      resp = await fetch(userinfoEndpoint, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
    }

    if (!resp.ok) {
      return NextResponse.json({ hasAddress: !!user?.encryptedAddressStreet, piiEnabled: true, verificationStatus: user?.verificationStatus ?? null })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile: any = await resp.json()
    const updates: Record<string, string> = {}
    const addr = profile.address
    if (addr) {
      if (addr.street_address) updates.encryptedAddressStreet = encryptPII(addr.street_address)
      if (addr.locality) updates.encryptedAddressCity = encryptPII(addr.locality)
      if (addr.region) updates.encryptedAddressState = encryptPII(addr.region)
      if (addr.postal_code) updates.encryptedAddressZip = encryptPII(addr.postal_code)
      if (addr.country) updates.encryptedAddressCountry = encryptPII(addr.country)
    }
    if (profile.birthdate) updates.encryptedBirthday = encryptPII(profile.birthdate)
    if (profile.verification_status) updates.verificationStatus = profile.verification_status

    const newVerificationStatus = profile.verification_status ?? user?.verificationStatus ?? null

    if (Object.keys(updates).length > 0) {
      await prisma.user.update({ where: { id: userId }, data: updates })
      return NextResponse.json({ hasAddress: !!addr?.street_address || !!user?.encryptedAddressStreet, piiEnabled: true, verificationStatus: newVerificationStatus })
    }

    return NextResponse.json({ hasAddress: !!user?.encryptedAddressStreet, piiEnabled: true, verificationStatus: newVerificationStatus })
  } catch (err) {
    console.error("Failed to refresh address from HCA:", err)
    return NextResponse.json({ hasAddress: !!user?.encryptedAddressStreet, piiEnabled: true, verificationStatus: user?.verificationStatus ?? null })
  }
}
