import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { searchDigiKey } from "@/lib/inventory/digikey"

export async function GET(request: Request) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q")

  if (!q || q.trim().length === 0) {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 }
    )
  }

  try {
    const results = await searchDigiKey(q.trim())
    return NextResponse.json(results)
  } catch (error) {
    console.error("[DigiKey] Search failed:", error)
    return NextResponse.json(
      { error: "DigiKey search failed. The service may not be configured." },
      { status: 502 }
    )
  }
}
