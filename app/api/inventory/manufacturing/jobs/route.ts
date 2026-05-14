import { NextResponse } from "next/server"
import { requireInventoryAccess } from "@/lib/inventory/access"
import {
  createManufacturingJob,
  OPEN_JOB_STATUSES,
  readManufacturingState,
} from "@/lib/inventory/manufacturing"

function badRequest(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Could not create print job." },
    { status: 400 }
  )
}

export async function GET() {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error

  return NextResponse.json(await readManufacturingState(result.session.user.id))
}

export async function POST(request: Request) {
  const result = await requireInventoryAccess()
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const job = await createManufacturingJob(result.session.user.id, body, false)
    const state = await readManufacturingState(result.session.user.id)
    const queuePosition =
      state.jobs
        .filter((candidate) => OPEN_JOB_STATUSES.includes(candidate.status))
        .findIndex((candidate) => candidate.id === job.id) + 1

    return NextResponse.json(
      { job, queuePosition: Math.max(queuePosition, 1), state },
      { status: 201 }
    )
  } catch (error) {
    return badRequest(error)
  }
}
