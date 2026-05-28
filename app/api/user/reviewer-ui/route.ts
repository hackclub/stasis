import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/admin-auth";

// Admin-only preference toggle: when `useOld` is true, the review queue page
// links into /admin/review/[id]/old instead of the default redesigned route.

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { reviewerUiOld: true },
  });

  return NextResponse.json({ useOld: user?.reviewerUiOld ?? false });
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { session } = gate;

  const body = await request.json().catch(() => ({}));
  if (typeof body.useOld !== "boolean") {
    return NextResponse.json({ error: "useOld must be a boolean" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { reviewerUiOld: body.useOld },
  });

  return NextResponse.json({ success: true });
}
