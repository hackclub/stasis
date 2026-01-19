import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

export async function POST() {
  const superadminEmail = process.env.SUPERADMIN_EMAIL
  if (!superadminEmail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (session.user.email !== superadminEmail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const hcaAccount = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      providerId: "hca",
    },
  })

  if (!hcaAccount) {
    return NextResponse.json({ error: "Must be logged in via HCA" }, { status: 403 })
  }

  await prisma.user.update({
    where: { id: session.user.id, email: superadminEmail },
    data: { isAdmin: true },
  })

  return NextResponse.json({ success: true, message: "Admin access granted" })
}
