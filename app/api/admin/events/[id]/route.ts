import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const { id } = await params

  const existing = await prisma.event.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 })
  }

  const body = await request.json()
  const data: Record<string, unknown> = {}

  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim()
  if (typeof body.description === "string" && body.description.trim()) data.description = body.description.trim()
  if (typeof body.dateTime === "string" && !isNaN(Date.parse(body.dateTime))) data.dateTime = new Date(body.dateTime)
  if (body.linkUrl !== undefined) data.linkUrl = typeof body.linkUrl === "string" && body.linkUrl.trim() ? body.linkUrl.trim() : null
  if (body.linkText !== undefined) data.linkText = typeof body.linkText === "string" && body.linkText.trim() ? body.linkText.trim() : null

  const updated = await prisma.event.update({ where: { id }, data })

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const { id } = await params

  const existing = await prisma.event.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 })
  }

  await prisma.event.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
