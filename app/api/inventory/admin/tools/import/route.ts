import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"
import {
  sanitizeDescription,
  sanitizeName,
  validateImageUrl,
} from "@/lib/inventory/validation"

type ToolImportRow = {
  name: string
  description: string | null
  imageUrl: string | null
  quantity: number
}

function readQuantity(value: unknown): number {
  if (value === undefined || value === null || value === "") return 1

  const quantity = Number(value)
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("quantity must be a positive integer when provided")
  }

  return quantity
}

export async function POST(request: Request) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  const { session } = result
  const body = await request.json()
  const { tools } = body

  if (!Array.isArray(tools) || tools.length === 0) {
    return NextResponse.json(
      { error: "Request body must contain a non-empty tools array" },
      { status: 400 }
    )
  }

  if (tools.length > 500) {
    return NextResponse.json(
      { error: "Cannot import more than 500 rows at once" },
      { status: 400 }
    )
  }

  let rows: ToolImportRow[]
  try {
    rows = tools.map((tool: Record<string, unknown>) => {
      const name = sanitizeName(String(tool.name ?? ""))
      if (!name) throw new Error("Name is required for all tools")

      return {
        name,
        description: tool.description ? sanitizeDescription(String(tool.description)) : null,
        imageUrl: validateImageUrl(tool.imageUrl ?? tool.image_url),
        quantity: readQuantity(tool.quantity ?? tool.stock),
      }
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid import data" },
      { status: 400 }
    )
  }

  const createRows = rows.flatMap((tool) =>
    Array.from({ length: tool.quantity }, () => ({
      name: tool.name,
      description: tool.description,
      imageUrl: tool.imageUrl,
    }))
  )

  if (createRows.length > 500) {
    return NextResponse.json(
      { error: "Cannot import more than 500 tools at once" },
      { status: 400 }
    )
  }

  await prisma.tool.createMany({ data: createRows })

  await logAdminAction(
    AuditAction.INVENTORY_IMPORT,
    session.user.id,
    session.user.email,
    "Tool",
    undefined,
    { count: createRows.length, rowCount: rows.length }
  )

  return NextResponse.json(
    { imported: createRows.length, rows: rows.length },
    { status: 201 }
  )
}
