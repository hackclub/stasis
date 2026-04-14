import { auth } from "@/lib/auth"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"
import prisma from "@/lib/prisma"
import { cookies, headers } from "next/headers"
import { NextResponse } from "next/server"
import crypto from "crypto"

/**
 * Sign a cookie value the same way better-auth/better-call does:
 * HMAC-SHA256(value, secret) → base64 → "value.signature"
 */
async function signCookieValue(value: string, secret: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  )
  const sigBytes = new Uint8Array(signature)
  let sigStr = ""
  for (let i = 0; i < sigBytes.length; i++) sigStr += String.fromCharCode(sigBytes[i])
  const base64Sig = btoa(sigStr)
  return `${value}.${base64Sig}`
}

export async function POST(request: Request) {
  const result = await requireAdmin()
  if (result.error) return result.error

  const { session } = result
  const body = await request.json()
  const targetUserId = body.userId as string

  if (!targetUserId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 })
  }

  if (targetUserId === session.user.id) {
    return NextResponse.json({ error: "Cannot impersonate yourself" }, { status: 400 })
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, email: true },
  })

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  // Create a new session for the target user
  const token = crypto.randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60) // 1 hour

  const headersList = await headers()
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || null
  const userAgent = headersList.get("user-agent") || null

  await prisma.session.create({
    data: {
      id: crypto.randomBytes(16).toString("hex"),
      token,
      userId: targetUserId,
      expiresAt,
      ipAddress: ip,
      userAgent: userAgent ? `[IMPERSONATION by ${session.user.email}] ${userAgent}` : `[IMPERSONATION by ${session.user.email}]`,
    },
  })

  await logAdminAction(
    AuditAction.ADMIN_IMPERSONATE,
    session.user.id,
    session.user.email,
    "user",
    targetUserId,
    { targetEmail: targetUser.email, targetName: targetUser.name }
  )

  // Store admin's current session token so they can switch back
  const cookieStore = await cookies()
  const currentToken = cookieStore.get("better-auth.session_token")?.value
    || cookieStore.get("__Secure-better-auth.session_token")?.value

  if (currentToken) {
    cookieStore.set("stasis-admin-token", currentToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60, // 1 hour
    })
  }

  // Set the impersonation session cookie (must be HMAC-signed like better-auth expects)
  const isSecure = process.env.NODE_ENV === "production"
  const cookieName = isSecure ? "__Secure-better-auth.session_token" : "better-auth.session_token"
  const secret = process.env.BETTER_AUTH_SECRET!
  const signedToken = await signCookieValue(token, secret)
  cookieStore.set(cookieName, signedToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  })

  // Clear the session data cache cookie so better-auth re-fetches from DB
  const sessionDataCookieName = isSecure ? "__Secure-better-auth.session_data" : "better-auth.session_data"
  cookieStore.delete(sessionDataCookieName)

  // Set a non-httpOnly cookie so the client can show the impersonation banner
  cookieStore.set("stasis-impersonating", JSON.stringify({
    userId: targetUser.id,
    name: targetUser.name || targetUser.email,
    adminName: session.user.name || session.user.email,
  }), {
    httpOnly: false,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  })

  return NextResponse.json({ success: true })
}

export async function DELETE() {
  const cookieStore = await cookies()
  const adminToken = cookieStore.get("stasis-admin-token")?.value

  if (!adminToken) {
    return NextResponse.json({ error: "No admin session to restore" }, { status: 400 })
  }

  // Restore admin session
  const isSecure = process.env.NODE_ENV === "production"
  const cookieName = isSecure ? "__Secure-better-auth.session_token" : "better-auth.session_token"
  cookieStore.set(cookieName, adminToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  })

  // Clean up impersonation cookies and session data cache
  cookieStore.delete("stasis-admin-token")
  cookieStore.delete("stasis-impersonating")
  const sessionDataName = isSecure ? "__Secure-better-auth.session_data" : "better-auth.session_data"
  cookieStore.delete(sessionDataName)

  return NextResponse.json({ success: true })
}
