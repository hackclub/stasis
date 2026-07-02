import { NextResponse } from "next/server"
import { submissionsClosed } from "@/lib/event"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ submissionsClosed: submissionsClosed() })
}
