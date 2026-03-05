import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { encryptPII } from "@/lib/pii"

const DISCOVERY_URL = "https://auth.hackclub.com/.well-known/openid-configuration"

interface OIDCConfig {
  token_endpoint: string
  userinfo_endpoint: string
}

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
  refresh_token?: string
}

let cachedOIDCConfig: OIDCConfig | null = null

async function getOIDCConfig(): Promise<OIDCConfig> {
  if (cachedOIDCConfig) return cachedOIDCConfig
  const resp = await fetch(DISCOVERY_URL)
  if (!resp.ok) throw new Error(`Failed to fetch OIDC discovery: ${resp.status}`)
  const config = await resp.json()
  cachedOIDCConfig = {
    token_endpoint: config.token_endpoint,
    userinfo_endpoint: config.userinfo_endpoint,
  }
  return cachedOIDCConfig
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse | null> {
  const { token_endpoint } = await getOIDCConfig()
  const resp = await fetch(token_endpoint, {
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
  const { userinfo_endpoint } = await getOIDCConfig()
  const resp = await fetch(userinfo_endpoint, {
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

  // Run backfill in the background — respond immediately
  runBackfill(accounts).catch((err) =>
    console.error("[backfill-addresses] Unexpected error:", err)
  )

  return NextResponse.json({
    message: "Backfill started",
    total: accounts.length,
  })
}

async function runBackfill(accounts: Array<{ id: string; userId: string; accessToken: string | null; refreshToken: string | null }>) {
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  console.log(`[backfill-addresses] Starting backfill for ${accounts.length} users`)

  let updated = 0
  let failed = 0

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i]

    if (i > 0) await delay(500)

    try {
      console.log(`[backfill-addresses] (${i + 1}/${accounts.length}) Processing user ${account.userId}`)

      // Try existing access token first, then refresh
      let accessToken = account.accessToken
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let profile: any = accessToken ? await fetchUserInfo(accessToken) : null

      if (!profile && account.refreshToken) {
        console.log(`[backfill-addresses] Refreshing token for user ${account.userId}`)
        const tokenData = await refreshAccessToken(account.refreshToken)
        if (!tokenData) {
          console.log(`[backfill-addresses] Token refresh failed for user ${account.userId}`)
          failed++
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
        console.log(`[backfill-addresses] Could not fetch userinfo for user ${account.userId}`)
        failed++
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
        console.log(`[backfill-addresses] Updated address for user ${account.userId} (${Object.keys(updates).length} fields)`)
      } else {
        console.log(`[backfill-addresses] No address data in HCA profile for user ${account.userId}`)
        failed++
      }
    } catch (err) {
      console.error(`[backfill-addresses] Error processing user ${account.userId}:`, err)
      failed++
    }
  }

  console.log(`[backfill-addresses] Complete: ${updated} updated, ${failed} failed out of ${accounts.length} total`)
}
