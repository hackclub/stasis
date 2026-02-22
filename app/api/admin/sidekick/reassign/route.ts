import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { reassignAllFromSidekick, reassignSidekick } from "@/lib/sidekick";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const body = await request.json();

  // Single reassignment: { assigneeId, newSidekickId? }
  if (body.assigneeId) {
    const result = await reassignSidekick(body.assigneeId, body.newSidekickId);
    if (!result) {
      return NextResponse.json(
        { error: "No sidekicks available for reassignment" },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true, assignment: result });
  }

  // Bulk reassignment: { sidekickId }
  if (body.sidekickId) {
    const results = await reassignAllFromSidekick(body.sidekickId);
    return NextResponse.json({
      success: true,
      reassigned: results.filter(Boolean).length,
    });
  }

  return NextResponse.json(
    { error: "Must provide either assigneeId or sidekickId" },
    { status: 400 }
  );
}
