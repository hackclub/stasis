import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { checkInventoryAccess } from "@/lib/inventory/access"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const access = await checkInventoryAccess(session.user.id)
  return NextResponse.json(access)
}
