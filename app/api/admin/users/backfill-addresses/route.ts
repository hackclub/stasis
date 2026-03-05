import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { encryptPII } from "@/lib/pii"

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
  refresh_token?: string
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse | null> {
  const resp = await fetch("https://auth.hackclub.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.HCA_CLIENT_ID!,
      client_secret: process.env.HCA_CLIENT_SECRET!,
    }),
  })
  if (!resp.ok) return null
  return resp.json() as Promise<TokenResponse>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchUserInfo(accessToken: string): Promise<any | null> {
  const resp = await fetch("https://auth.hackclub.com/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!resp.ok) return null
  return resp.json()
}

export async function POST() {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  // Find users missing address data who have an HCA account with a refresh token
  const accounts = await prisma.account.findMany({
    where: {
      providerId: "hca",
      refreshToken: { not: null },
      user: {
        encryptedAddressStreet: null,
      },
    },
    select: {
      id: true,
      userId: true,
      accessToken: true,
      refreshToken: true,
    },
  })

  let updated = 0
  let failed = 0
  const errors: Array<{ userId: string; error: string }> = []

  for (const account of accounts) {
    try {
      // Try existing access token first, then refresh
      let accessToken = account.accessToken
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let profile: any = accessToken ? await fetchUserInfo(accessToken) : null

      if (!profile && account.refreshToken) {
        const tokenData = await refreshAccessToken(account.refreshToken)
        if (!tokenData) {
          failed++
          errors.push({ userId: account.userId, error: "Token refresh failed" })
          continue
        }

        accessToken = tokenData.access_token

        // Persist the new tokens
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

        profile = await fetchUserInfo(tokenData.access_token)
      }

      if (!profile) {
        failed++
        errors.push({ userId: account.userId, error: "Could not fetch userinfo" })
        continue
      }

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

      if (Object.keys(updates).length > 0) {
        await prisma.user.update({ where: { id: account.userId }, data: updates })
        updated++
      } else {
        errors.push({ userId: account.userId, error: "No address data in HCA profile" })
        failed++
      }
    } catch (err) {
      failed++
      errors.push({ userId: account.userId, error: String(err) })
    }
  }

  return NextResponse.json({
    total: accounts.length,
    updated,
    failed,
    errors: errors.slice(0, 50),
  })
}
