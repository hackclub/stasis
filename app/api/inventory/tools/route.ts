import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tools = await prisma.tool.findMany({ orderBy: { name: "asc" } })
  return NextResponse.json(tools)
}
