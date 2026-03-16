import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

export async function GET() {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const events = await prisma.event.findMany({
    orderBy: { dateTime: "asc" },
  })

  return NextResponse.json({ events })
}

export async function POST(request: NextRequest) {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const body = await request.json()
  const { name, description, dateTime, linkUrl, linkText } = body

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }
  if (typeof description !== "string" || !description.trim()) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 })
  }
  if (typeof dateTime !== "string" || isNaN(Date.parse(dateTime))) {
    return NextResponse.json({ error: "Valid dateTime is required" }, { status: 400 })
  }

  const event = await prisma.event.create({
    data: {
      name: name.trim(),
      description: description.trim(),
      dateTime: new Date(dateTime),
      linkUrl: typeof linkUrl === "string" && linkUrl.trim() ? linkUrl.trim() : null,
      linkText: typeof linkText === "string" && linkText.trim() ? linkText.trim() : null,
    },
  })

  return NextResponse.json(event, { status: 201 })
}
