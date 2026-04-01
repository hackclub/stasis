import { NextRequest, NextResponse } from "next/server"
import Airtable from "airtable"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import prisma from "@/lib/prisma"

const UNIFIED_BASE_ID = process.env.AIRTABLE_UNIFIED_BASE_ID || "app3A5kJwYqxMLOgh"
const APPROVED_PROJECTS_TABLE = "tblzWWGUYHVH7Zyqf"
const CODE_URL_FIELD = "fldZhfNBM9GR0TR0R"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const { id } = await params

  const apiKey = process.env.AIRTABLE_API_KEY
  if (!apiKey) {
    return NextResponse.json({ found: false })
  }

  // Get the project's GitHub URL
  const project = await prisma.project.findUnique({
    where: { id },
    select: { githubRepo: true },
  })

  if (!project?.githubRepo) {
    return NextResponse.json({ found: false })
  }

  const githubUrl = project.githubRepo.replace(/\/+$/, "")

  try {
    const base = new Airtable({ apiKey }).base(UNIFIED_BASE_ID)

    // Only fetch the Code URL field — no PII
    const records = await base(APPROVED_PROJECTS_TABLE)
      .select({
        fields: ["Code URL"],
        filterByFormula: `{${CODE_URL_FIELD}} = '${githubUrl.replace(/'/g, "\\'")}'`,
        maxRecords: 1,
      })
      .firstPage()

    if (records.length > 0) {
      return NextResponse.json({ found: true, url: githubUrl })
    }

    // Also try with trailing slash and alternate casing
    const altUrl = githubUrl.toLowerCase()
    if (altUrl !== githubUrl) {
      const altRecords = await base(APPROVED_PROJECTS_TABLE)
        .select({
          fields: ["Code URL"],
          filterByFormula: `LOWER({${CODE_URL_FIELD}}) = '${altUrl.replace(/'/g, "\\'")}'`,
          maxRecords: 1,
        })
        .firstPage()

      if (altRecords.length > 0) {
        return NextResponse.json({ found: true, url: githubUrl })
      }
    }

    return NextResponse.json({ found: false })
  } catch (err) {
    console.error("Failed to check Airtable for duplicate project:", err)
    return NextResponse.json({ found: false })
  }
}
