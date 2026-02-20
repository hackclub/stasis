import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin()
  if (authCheck.error) return authCheck.error

  const format = request.nextUrl.searchParams.get("format")

  const rsvps = await prisma.tempRsvp.findMany({
    where: { syncedToAirtable: false },
    orderBy: { createdAt: "desc" },
  })

  if (format === "csv") {
    const header = "Email,First Name,Last Name,IP,UTM Source,Referred By,Finished Account Creation,Created At"
    const rows = rsvps.map((r) =>
      [
        r.email,
        r.firstName || "",
        r.lastName || "",
        r.ip || "",
        r.utmSource || "",
        r.referredBy || "",
        r.finishedAccount ? "true" : "false",
        r.createdAt.toISOString(),
      ]
        .map((v) => `"${v.replace(/"/g, '""')}"`)
        .join(",")
    )
    const csv = [header, ...rows].join("\n")

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="temp-rsvps-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    })
  }

  return NextResponse.json(rsvps)
}
