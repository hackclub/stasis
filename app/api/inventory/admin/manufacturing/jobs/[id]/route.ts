import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import {
  deleteManufacturingJob,
  readManufacturingState,
  updateManufacturingJob,
} from "@/lib/inventory/manufacturing"

type Context = {
  params: Promise<{ id: string }>
}

function badRequest(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Manufacturing job request failed." },
    { status: 400 }
  )
}

export async function PATCH(request: Request, { params }: Context) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  try {
    const { id } = await params
    const body = await request.json()
    const job = await updateManufacturingJob(id, body)
    return NextResponse.json({
      job,
      state: await readManufacturingState(result.session.user.id),
    })
  } catch (error) {
    return badRequest(error)
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  try {
    const { id } = await params
    await deleteManufacturingJob(id)
    return NextResponse.json({
      state: await readManufacturingState(result.session.user.id),
    })
  } catch (error) {
    return badRequest(error)
  }
}
