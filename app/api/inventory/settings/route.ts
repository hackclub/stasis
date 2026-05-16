import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET() {
  const settings = await prisma.inventorySettings.findUnique({
    where: { id: "singleton" },
    select: { enabled: true },
  })

  return NextResponse.json({ enabled: settings?.enabled ?? false })
}
