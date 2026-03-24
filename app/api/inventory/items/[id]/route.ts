import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const item = await prisma.item.findUnique({ where: { id } })
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 })

  return NextResponse.json(item)
}
