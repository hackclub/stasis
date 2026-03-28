import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireInventoryAccess } from "@/lib/inventory/access"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error

  const { id } = await params

  const item = await prisma.item.findUnique({ where: { id } })
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 })

  return NextResponse.json(item)
}
