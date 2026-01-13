import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() })
  
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  })

  if (!user?.isAdmin) {
    return { error: NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 }) }
  }

  return { session, user }
}
