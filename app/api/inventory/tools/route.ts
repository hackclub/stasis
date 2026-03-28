import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireInventoryAccess } from "@/lib/inventory/access"

export async function GET() {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error

  const tools = await prisma.tool.findMany({ orderBy: { name: "asc" } })
  return NextResponse.json(tools)
}
